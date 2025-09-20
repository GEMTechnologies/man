import { BrowserWindow, dialog, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { zip } from "cross-zip";
import log from "electron-log";
import type {
  ExportDocumentPayload,
  ExportSlidesPayload,
  ExportResult,
} from "../ipc_types";

const logger = log.scope("export_handlers");

function sanitizeFilename(title: string, fallback: string, extension: string) {
  const safeTitle = (title || fallback)
    .replace(/[^a-zA-Z0-9\s_-]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const base = safeTitle.length > 0 ? safeTitle.slice(0, 64) : fallback;
  return `${base}.${extension}`;
}

function markdownToParagraphs(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    paragraphs.push(buffer.join(" ").trim());
    buffer = [];
  };

  for (const line of lines) {
    if (line.trim().length === 0) {
      flush();
      continue;
    }
    buffer.push(line.trim());
  }
  flush();

  if (paragraphs.length === 0) {
    const trimmed = markdown.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }

  return paragraphs;
}

function htmlToParagraphs(html: string): string[] {
  const normalized = html
    .replace(/\r\n/g, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "</$1>\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .trim();

  return normalized
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function getParagraphsFromPayload(
  payload: ExportDocumentPayload,
): string[] {
  if (payload.format === "html") {
    return htmlToParagraphs(payload.body);
  }
  return markdownToParagraphs(payload.body);
}

function buildDocxDocumentXml(payload: ExportDocumentPayload): string {
  const paragraphs = getParagraphsFromPayload(payload);
  const safeParagraphs = paragraphs.length > 0 ? paragraphs : [" "];
  const paragraphXml = safeParagraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function createDocxArchive(
  payload: ExportDocumentPayload,
  destination: string,
) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "man-docx-"));
  const relsDir = path.join(tempRoot, "_rels");
  const docPropsDir = path.join(tempRoot, "docProps");
  const wordDir = path.join(tempRoot, "word");

  try {
    await fs.mkdir(relsDir, { recursive: true });
    await fs.mkdir(docPropsDir, { recursive: true });
    await fs.mkdir(wordDir, { recursive: true });

    await fs.writeFile(
      path.join(tempRoot, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    );

    await fs.mkdir(path.join(tempRoot, "_rels"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "_rels", ".rels"),
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    );

    const now = new Date().toISOString();

    await fs.writeFile(
      path.join(docPropsDir, "core.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(payload.title || "man document")}</dc:title>
  <dc:creator>man</dc:creator>
  <cp:lastModifiedBy>man</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`,
    );

    await fs.writeFile(
      path.join(docPropsDir, "app.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>man</Application>
</Properties>`,
    );

    await fs.writeFile(
      path.join(wordDir, "document.xml"),
      buildDocxDocumentXml(payload),
    );

    const finalPath = destination;
    await new Promise<void>((resolve, reject) => {
      zip(tempRoot, finalPath, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function exportDocumentAsDocx(payload: ExportDocumentPayload): Promise<ExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: sanitizeFilename(payload.title, "man-document", "docx"),
    filters: [{ name: "Word Document", extensions: ["docx"] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  try {
    await createDocxArchive(payload, filePath);
    return { canceled: false, filePath };
  } catch (error) {
    logger.error("Failed to export DOCX", error);
    throw error;
  }
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line) => {
      if (line.startsWith("### ")) {
        return `<h3>${escapeHtml(line.slice(4))}</h3>`;
      }
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }
      if (line.startsWith("# ")) {
        return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      }
      if (line.trim().length === 0) {
        return "";
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return `<p>• ${escapeHtml(line.slice(2))}</p>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function exportDocumentAsPdf(payload: ExportDocumentPayload): Promise<ExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: sanitizeFilename(payload.title, "man-document", "pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
    },
  });

  const documentBody =
    payload.format === "html"
      ? payload.body
      : markdownToHtml(payload.body);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Times New Roman', serif; margin: 32px; line-height: 1.5; }
    h1, h2, h3 { color: #111827; }
    ul { margin: 0 0 16px 24px; }
    p { margin: 0 0 12px 0; }
  </style>
</head>
<body>
${documentBody}
</body>
</html>`;

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdfData = await window.webContents.printToPDF({ printBackground: true });
  await fs.writeFile(filePath, pdfData);
  window.close();
  return { canceled: false, filePath };
}

const SLIDE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Man Master">
    <p:bg>
      <a:noFill/>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483648" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;

const SLIDE_MASTER_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;

const SLIDE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="titleAndContent" preserve="1">
  <p:cSld name="Title and Content">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph type="title"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:endParaRPr lang="en-US"/>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content Placeholder 1"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr lvl="0">
              <a:buChar char="•"/>
            </a:pPr>
            <a:endParaRPr lang="en-US"/>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>`;

const SLIDE_LAYOUT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const THEME1_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1>
        <a:sysClr val="windowText" lastClr="000000"/>
      </a:dk1>
      <a:lt1>
        <a:sysClr val="window" lastClr="FFFFFF"/>
      </a:lt1>
      <a:dk2>
        <a:srgbClr val="1F497D"/>
      </a:dk2>
      <a:lt2>
        <a:srgbClr val="EEECE1"/>
      </a:lt2>
      <a:accent1>
        <a:srgbClr val="4F81BD"/>
      </a:accent1>
      <a:accent2>
        <a:srgbClr val="C0504D"/>
      </a:accent2>
      <a:accent3>
        <a:srgbClr val="9BBB59"/>
      </a:accent3>
      <a:accent4>
        <a:srgbClr val="8064A2"/>
      </a:accent4>
      <a:accent5>
        <a:srgbClr val="4BACC6"/>
      </a:accent5>
      <a:accent6>
        <a:srgbClr val="F79646"/>
      </a:accent6>
      <a:hlink>
        <a:srgbClr val="0000FF"/>
      </a:hlink>
      <a:folHlink>
        <a:srgbClr val="800080"/>
      </a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill>
          <a:schemeClr val="accent1"/>
        </a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0">
              <a:schemeClr val="accent1"/>
            </a:gs>
            <a:gs pos="100000">
              <a:schemeClr val="accent1"/>
            </a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="1"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0">
              <a:schemeClr val="accent2"/>
            </a:gs>
            <a:gs pos="100000">
              <a:schemeClr val="accent2"/>
            </a:gs>
          </a:gsLst>
          <a:lin ang="16200000" scaled="1"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill>
            <a:schemeClr val="accent1"/>
          </a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill>
            <a:schemeClr val="accent2"/>
          </a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr">
          <a:solidFill>
            <a:schemeClr val="accent3"/>
          </a:solidFill>
          <a:prstDash val="solid"/>
          <a:miter lim="800000"/>
        </a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle>
          <a:effectLst/>
        </a:effectStyle>
        <a:effectStyle>
          <a:effectLst/>
        </a:effectStyle>
        <a:effectStyle>
          <a:effectLst/>
        </a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill>
          <a:schemeClr val="lt1"/>
        </a:solidFill>
        <a:solidFill>
          <a:schemeClr val="accent1"/>
        </a:solidFill>
        <a:solidFill>
          <a:schemeClr val="accent2"/>
        </a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`;

function buildPptxContentTypes(slideCount: number): string {
  const slideOverrides = Array.from({ length: slideCount }, (_, index) =>
    `  <Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${slideOverrides}
</Types>`;
}

function buildPresentationXml(slideCount: number): string {
  const slideEntries = Array.from({ length: slideCount }, (_, index) =>
    `    <p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${slideEntries}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function buildPresentationRels(slideCount: number): string {
  const slideRelationships = Array.from({ length: slideCount }, (_, index) =>
    `  <Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRelationships}
</Relationships>`;
}

function sanitizeSlideText(text: string): string {
  return escapeXml(text).replace(/\r?\n/g, " ");
}

function createBulletParagraph(
  text: string,
  options: { italic?: boolean; level?: number; bullet?: boolean } = {},
): string {
  const { italic = false, level = 0, bullet = true } = options;
  const sanitized = sanitizeSlideText(text);
  const levelAttr = level > 0 ? ` lvl="${level}"` : "";
  const rPrAttrs = `lang="en-US" dirty="0" smtClean="0"${italic ? " i=\"1\"" : ""}`;
  const bulletElement = bullet
    ? "<a:buChar char=\"•\"/>"
    : "<a:buNone/>";

  return `<a:p>
    <a:pPr${levelAttr}>
      ${bulletElement}
    </a:pPr>
    <a:r>
      <a:rPr ${rPrAttrs}/>
      <a:t>${sanitized}</a:t>
    </a:r>
    <a:endParaRPr lang="en-US" dirty="0"/>
  </a:p>`;
}

function createBodyParagraphs(slide: ExportSlidesPayload["slides"][number]): string {
  const paragraphs: string[] = [];

  for (const bullet of slide.bullets) {
    if (typeof bullet === "string" && bullet.trim().length > 0) {
      paragraphs.push(createBulletParagraph(bullet));
    }
  }

  if (slide.visuals && slide.visuals.length > 0) {
    paragraphs.push(
      createBulletParagraph(`Visual suggestions: ${slide.visuals.join(", ")}`, {
        level: 1,
      }),
    );
  }

  if (slide.notes && slide.notes.trim().length > 0) {
    paragraphs.push(
      createBulletParagraph(`Presenter notes: ${slide.notes}`, {
        italic: true,
      }),
    );
  }

  if (paragraphs.length === 0) {
    paragraphs.push(createBulletParagraph("", { bullet: false }));
  }

  return paragraphs.join("\n");
}

function buildSlideXml(index: number, slide: ExportSlidesPayload["slides"][number]): string {
  const title = slide.title && slide.title.trim().length > 0
    ? sanitizeSlideText(slide.title)
    : `Slide ${index}`;
  const bodyParagraphs = createBodyParagraphs(slide);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title ${index}"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph type="title"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" dirty="0" smtClean="0"/>
              <a:t>${title}</a:t>
            </a:r>
            <a:endParaRPr lang="en-US" dirty="0"/>
          </a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content Placeholder ${index}"/>
          <p:cNvSpPr/>
          <p:nvPr>
            <p:ph type="body" idx="1"/>
          </p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
${bodyParagraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>`;
}

function buildSlideRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
}

async function createPptxArchive(
  payload: ExportSlidesPayload,
  destination: string,
) {
  const slideCount = payload.slides.length;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "man-pptx-"));
  const relsDir = path.join(tempRoot, "_rels");
  const docPropsDir = path.join(tempRoot, "docProps");
  const pptDir = path.join(tempRoot, "ppt");
  const pptRelsDir = path.join(pptDir, "_rels");
  const slideDir = path.join(pptDir, "slides");
  const slideRelsDir = path.join(slideDir, "_rels");
  const slideMasterDir = path.join(pptDir, "slideMasters");
  const slideMasterRelsDir = path.join(slideMasterDir, "_rels");
  const slideLayoutDir = path.join(pptDir, "slideLayouts");
  const slideLayoutRelsDir = path.join(slideLayoutDir, "_rels");
  const themeDir = path.join(pptDir, "theme");

  try {
    await Promise.all([
      fs.mkdir(relsDir, { recursive: true }),
      fs.mkdir(docPropsDir, { recursive: true }),
      fs.mkdir(pptDir, { recursive: true }),
      fs.mkdir(pptRelsDir, { recursive: true }),
      fs.mkdir(slideDir, { recursive: true }),
      fs.mkdir(slideRelsDir, { recursive: true }),
      fs.mkdir(slideMasterDir, { recursive: true }),
      fs.mkdir(slideMasterRelsDir, { recursive: true }),
      fs.mkdir(slideLayoutDir, { recursive: true }),
      fs.mkdir(slideLayoutRelsDir, { recursive: true }),
      fs.mkdir(themeDir, { recursive: true }),
    ]);

    await fs.writeFile(
      path.join(tempRoot, "[Content_Types].xml"),
      buildPptxContentTypes(slideCount),
    );

    await fs.writeFile(
      path.join(relsDir, ".rels"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    );

    const now = new Date().toISOString();
    await fs.writeFile(
      path.join(docPropsDir, "core.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(payload.title || "man presentation")}</dc:title>
  <dc:creator>man</dc:creator>
  <cp:lastModifiedBy>man</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`,
    );

    await fs.writeFile(
      path.join(docPropsDir, "app.xml"),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>man</Application>
  <Slides>${slideCount}</Slides>
  <PresentationFormat>Custom</PresentationFormat>
</Properties>`,
    );

    await fs.writeFile(
      path.join(pptDir, "presentation.xml"),
      buildPresentationXml(slideCount),
    );

    await fs.writeFile(
      path.join(pptRelsDir, "presentation.xml.rels"),
      buildPresentationRels(slideCount),
    );

    await fs.writeFile(
      path.join(slideMasterDir, "slideMaster1.xml"),
      SLIDE_MASTER_XML,
    );
    await fs.writeFile(
      path.join(slideMasterRelsDir, "slideMaster1.xml.rels"),
      SLIDE_MASTER_RELS_XML,
    );

    await fs.writeFile(
      path.join(slideLayoutDir, "slideLayout1.xml"),
      SLIDE_LAYOUT_XML,
    );
    await fs.writeFile(
      path.join(slideLayoutRelsDir, "slideLayout1.xml.rels"),
      SLIDE_LAYOUT_RELS_XML,
    );

    await fs.writeFile(path.join(themeDir, "theme1.xml"), THEME1_XML);

    for (let i = 0; i < slideCount; i += 1) {
      await fs.writeFile(
        path.join(slideDir, `slide${i + 1}.xml`),
        buildSlideXml(i + 1, payload.slides[i]),
      );
      await fs.writeFile(
        path.join(slideRelsDir, `slide${i + 1}.xml.rels`),
        buildSlideRelsXml(),
      );
    }

    await new Promise<void>((resolve, reject) => {
      zip(tempRoot, destination, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function exportSlidesAsPptx(
  payload: ExportSlidesPayload,
): Promise<ExportResult> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: sanitizeFilename(payload.title, "man-slides", "pptx"),
    filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  try {
    await createPptxArchive(payload, filePath);
    return { canceled: false, filePath };
  } catch (error) {
    logger.error("Failed to export PPTX", error);
    throw error;
  }
}

export function registerExportHandlers() {
  ipcMain.handle("export:document:docx", async (_event, payload: ExportDocumentPayload) => {
    return exportDocumentAsDocx(payload);
  });

  ipcMain.handle("export:document:pdf", async (_event, payload: ExportDocumentPayload) => {
    return exportDocumentAsPdf(payload);
  });

  ipcMain.handle("export:slides:pptx", async (_event, payload: ExportSlidesPayload) => {
    return exportSlidesAsPptx(payload);
  });
}

Tests delete-rename-write order
<man-delete path="src/main.tsx">
</man-delete>
<man-rename from="src/App.tsx" to="src/main.tsx">
</man-rename>
<man-write path="src/main.tsx" description="final main.tsx file.">
finalMainTsxFileWithError();
</man-write>
EOM

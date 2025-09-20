import { getGithubUser } from "../handlers/github_handlers";

export async function getGitAuthor() {
  const user = await getGithubUser();
  const author = user
    ? {
        name: `[man]`,
        email: user.email,
      }
    : {
        name: "[man]",
        email: "git@man.sh",
      };
  return author;
}

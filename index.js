const { Toolkit } = require("actions-toolkit");
const { execSync } = require("child_process");
const core = require("@actions/core");
const github = require("@actions/github");

const PR_NUMBER = github.context.payload.number;

// Change working directory if user defined PACKAGEJSON_DIR
if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

// Run your GitHub Action!
Toolkit.run(async tools => {
  const pkg = tools.getPackageJSON();
  const event = tools.context.payload;

  const messages = event.commits.map(
    commit => commit.message + "\n" + commit.body
  );

  const commitMessage = "version bump to";
  const isVersionBump = messages
    .map(message => message.toLowerCase().includes(commitMessage))
    .includes(true);
  if (isVersionBump) {
    tools.exit.success("No action necessary!");
    return;
  }

  let version = "patch";
  if (messages.map(message => message.includes("major")).includes(true)) {
    version = "major";
  } else if (
    messages
      .map(message => message.toLowerCase().includes("minor"))
      .includes(true)
  ) {
    version = "minor";
  }

  try {
    const current = pkg.version.toString();
    // set git user
    await tools.runInWorkspace("git", [
      "config",
      "user.name",
      '"Automated Version Bump"'
    ]);
    await tools.runInWorkspace("git", [
      "config",
      "user.email",
      '"gh-action-bump-version@users.noreply.github.com"'
    ]);

    const currentBranch = /refs\/[a-zA-Z]+\/(.*)/.exec(
      process.env.GITHUB_REF
    )[1];
    console.log(
      "github.context.payload.head.ref: ",
      github.context.payload.head.ref
    );
    console.log("currentBranch:", currentBranch, process.env.GITHUB_REF);

    // do it in the current checked out github branch (DETACHED HEAD)
    // important for further usage of the package.json version
    await tools.runInWorkspace("git", [
      "checkout",
      github.context.payload.head.ref
    ]);
    await tools.runInWorkspace("npm", [
      "version",
      "--allow-same-version=true",
      "--git-tag-version=false",
      current
    ]);

    console.log("current:", current, "/", "version:", version);
    let newVersion = execSync(`npm version --git-tag-version=false ${version}`)
      .toString()
      .trim();
    await tools.runInWorkspace("git", [
      "commit",
      "-a",
      "-m",
      `ci: ${commitMessage} ${newVersion}`
    ]);

    // now go to the actual branch to perform the same versioning
    await tools.runInWorkspace("git", ["checkout", currentBranch]);
    await tools.runInWorkspace("npm", [
      "version",
      "--allow-same-version=true",
      "--git-tag-version=false",
      current
    ]);
    console.log("current:", current, "/", "version:", version);
    newVersion = execSync(`npm version --git-tag-version=false ${version}`)
      .toString()
      .trim();
    newVersion = `${process.env["INPUT_TAG-PREFIX"]}${newVersion}`;
    console.log("new version:", newVersion);
    await tools.runInWorkspace("git", [
      "commit",
      "-a",
      "-m",
      `ci: ${commitMessage} ${newVersion}`
    ]);

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;

    await tools.runInWorkspace("git", ["tag", newVersion]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--follow-tags"]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--tags"]);
  } catch (e) {
    tools.log.fatal(e);
    tools.exit.failure("Failed to bump version");
  }
  tools.exit.success("Version bumped!");
});

const { Toolkit } = require("actions-toolkit");
const { execSync } = require("child_process");
const github = require("@actions/github");

// Change working directory if user defined PACKAGEJSON_DIR
if (process.env.PACKAGEJSON_DIR) {
  process.env.GITHUB_WORKSPACE = `${process.env.GITHUB_WORKSPACE}/${process.env.PACKAGEJSON_DIR}`;
  process.chdir(process.env.GITHUB_WORKSPACE);
}

function getNewVersion(version) {
  return execSync(`npm version --git-tag-version=false ${version}`)
    .toString()
    .trim();
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

    const newVersion = getNewVersion(version);
    console.log(
      "current:",
      current,
      " / version:",
      version,
      " / newVersion: ",
      newVersion
    );

    const defaultBranch = github.context.payload.repository.default_branch;
    await tools.runInWorkspace("git", ["checkout", defaultBranch]);
    await tools.runInWorkspace("npm", [
      "version",
      "--allow-same-version=true",
      "--git-tag-version=false",
      current
    ]);

    const newVersionWithPrefix = `${
      process.env["INPUT_TAG-PREFIX"]
    }${getNewVersion(version)}`;
    await tools.runInWorkspace("git", [
      "commit",
      "-a",
      "-m",
      `ci: ${commitMessage} ${newVersionWithPrefix}`
    ]);

    const remoteRepo = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
    // console.log(Buffer.from(remoteRepo).toString('base64'))
    console.log("remoteRepo: ", remoteRepo);
    await tools.runInWorkspace("git", ["tag", newVersionWithPrefix]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--follow-tags"]);
    await tools.runInWorkspace("git", ["push", remoteRepo, "--tags"]);
  } catch (e) {
    tools.log.fatal(e);
    tools.exit.failure("Failed to bump version");
  }
  tools.exit.success("Version bumped!");
});

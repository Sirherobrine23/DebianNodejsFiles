import fs from "fs";
import path from "path";
import child_process from "child_process";
import yargs from "yargs";
import tar from "tar";
import * as httpRequest from "./httpRequest";
import createDebConfig from "./createDebConfig";

const args = yargs(process.argv.slice(2)).options("arch", {
  demandOption: true,
  describe: "The architecture of the package",
  default: "amd64",
  alias: "a",
}).option("node_version", {
  demandOption: true,
  describe: "The version of the package",
  default: "latest",
  alias: "n",
}).version(false).parseSync();

const archFind = [{deb: "amd64", binTar: "x64"}, {deb: "arm64", binTar: "arm64"}, {deb: "armhf", binTar: ""}, {deb: "ppc64el", binTar: ""}, {deb: "s390x", binTar: ""}]
async function createDeb(VERSION: string, TargetArch: string) {
  const { binTar, deb } = archFind.find(a => a.deb === TargetArch);
  const debFilePath = path.join(process.cwd(), `nodejs_${VERSION}_${deb}.deb`);
  if (fs.existsSync(debFilePath)) return debFilePath;
  const storageRoot = path.resolve(process.cwd(), "packages", deb, VERSION);
  const tarPath = path.join(storageRoot, `node-v${VERSION}-linux-${binTar}.tar.gz`);
  const tmpExtract = path.join(storageRoot, "tmp");
  const usrPath = path.join(storageRoot, "usr");
  const debianPath = path.join(storageRoot, "DEBIAN");
  if (fs.existsSync(storageRoot)) {
    fs.rmSync(storageRoot, {recursive: true, force: true});
    fs.mkdirSync(storageRoot, {recursive: true});
  } else fs.mkdirSync(storageRoot, {recursive: true});
  fs.writeFileSync(tarPath, await httpRequest.getBuffer(`https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-${binTar}.tar.gz`));
  if (!fs.existsSync(tmpExtract)) fs.mkdirSync(tmpExtract, {recursive: true});
  if (!fs.existsSync(usrPath)) fs.mkdirSync(usrPath, {recursive: true});
  await tar.x({
    file: tarPath,
    Directory: true,
    cwd: path.join(storageRoot, "tmp"),
  });
  fs.rmSync(tarPath);
  await new Promise(res => {
    for (const file of fs.readdirSync(path.resolve(tmpExtract, fs.readdirSync(tmpExtract)[0]))) {
      if (!/\.md|LICENSE/.test(file)) fs.renameSync(path.resolve(tmpExtract, fs.readdirSync(tmpExtract)[0], file), path.resolve(usrPath, file));
    }
    return res("");
  });
  fs.rmSync(tmpExtract, {recursive: true, force: true});
  // Create DEBIAN folder
  if (!fs.existsSync(debianPath)) fs.mkdirSync(debianPath, {recursive: true});
  // Create control file
  const controlFile = createDebConfig({
    packageName: "nodejs",
    Version: VERSION,
    arch: deb as any,
    Maintainer: "Matheus Sampaio Queiroga <srherobrine20@gmail.com>",
    Section: "web",
    Priority: "optional",
    Homepage: "https://nodejs.org/en/",
    Description: {
      short: "Node.js event-based server-side javascript engine",
      long: [
        "Node.js is similar in design to and influenced by systems like",
        "Ruby's Event Machine or Python's Twisted.",
        ".",
        "It takes the event model a bit further - it presents the event",
        "loop as a language construct instead of as a library.",
        ".",
        "Node.js is bundled with several useful libraries to handle server tasks :",
        "System, Events, Standard I/O, Modules, Timers, Child Processes, POSIX,",
        "HTTP, Multipart Parsing, TCP, DNS, Assert, Path, URL, Query Strings."
      ]
    },
    Depends: [
      {
        Package: "libc6",
        minVersion: ">= 2.17",
      },
      {
        Package: "libgcc1",
        minVersion: ">= 1:4.2",
      },
      {
        Package: "libstdc++6",
        minVersion: ">= 4.8",
      },
      {
        Package: "python3-minimal",
      },
      {
        Package: "ca-certificates"
      }
    ],
    Conflicts: [
      {
        Package: "nodejs-dev"
      },
      {
        Package: "nodejs-doc"
      },
      {
        Package: "nodejs-legacy"
      },
      {
        Package: "npm"
      }
    ],
    Replaces: [
      {
        Package: "nodejs-dev",
        minVersion: "<= 0.8.22"
      },
      {
        Package: "nodejs-legacy"
      },
      {
        Package: " npm",
        minVersion: "<= 1.2.14"
      }
    ],
    Provides: [
      {
        Package: "nodejs-dev"
      },
      {
        Package: "nodejs-doc"
      },
      {
        Package: "nodejs-legacy"
      },
      {
        Package: "npm"
      }
    ]
  });
  fs.writeFileSync(path.join(debianPath, "control"), controlFile);
  await new Promise((res, rej) => {
    const proc = child_process.execFile("dpkg-deb", ["--build", "--verbose", ".", debFilePath], {cwd: storageRoot}, err => err ? rej(err) : res(null));
    proc.stdout.on("data", data => process.stdout.write(data));
    proc.stderr.on("data", data => process.stderr.write(data));
  });
  fs.rmSync(storageRoot, {recursive: true, force: true});
  return debFilePath;
}

const archs = [];
httpRequest.getGithubTags("nodejs", "node").then(data => data.map(a => a.ref.replace(/refs\/tags\/heads\/tags\/v|refs\/tags\/v/, "")).reverse()).then(async data => {
  if (args.arch === "all") archs.push("amd64", "arm64", "armhf", "ppc64el", "s390x"); else archs.push(args.arch);
  // Versions
  if (args.node_version === "latest") {
    for (const arch of archs) await createDeb(data[0], arch).catch(err => console.log(err));
  } else if (args.node_version === "all") {
    for (const arch of archs) {
      while (true) {
        if (data.length <= 0) break;
        const toRemove = 30;
        const versions = data.slice(0, toRemove);
        data = data.slice(toRemove);
        versions.forEach(version => console.log("Nodejs:", version));
        await Promise.all(versions.map(version => createDeb(version, arch).catch(err => err)));
      }
    }
  } else await createDeb(args.node_version, args.arch);
});
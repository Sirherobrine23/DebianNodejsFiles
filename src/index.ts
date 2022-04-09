import fs from "fs";
import path from "path";
import child_process from "child_process";
import yargs from "yargs";
import tar from "tar";
import { getBuffer, uploadRelease, getGithubTags } from "./httpRequest";
import createDebConfig from "./createDebConfig";

const args = yargs(process.argv.slice(2)).option("ci", {
  demandOption: true,
  describe: "Upload to Github Releases",
  default: "",
  alias: "c",
}).options("arch", {
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
const archFind = [
  {deb: "amd64", binTar: "x64"},
  {deb: "arm64", binTar: "arm64"},
  {deb: "armhf", binTar: "armv7l"},
  {deb: "ppc64el", binTar: "ppc64el"},
  {deb: "s390x", binTar: "s390x"}
];
const tmpPath = path.resolve(process.cwd(), "nodejs_tmp");
if (fs.existsSync(tmpPath)) {
  fs.rmSync(tmpPath, {recursive: true, force: true});
  fs.mkdirSync(tmpPath, {recursive: true});
} else fs.mkdirSync(tmpPath, {recursive: true});

async function downloadTar(Version: string, arch: string) {
  console.log("Downloading tar to arch: %s, version: %s", arch, Version);
  const tarRoot = path.resolve(tmpPath, "tar_gz");
  if (fs.existsSync(tarRoot)) {
    fs.rmSync(tarRoot, {recursive: true, force: true});
    fs.mkdirSync(tarRoot, {recursive: true});
  } else fs.mkdirSync(tarRoot, {recursive: true});
  const tarPath = path.join(tarRoot, `node-v${Version}-linux-${arch}.tar.gz`);
  const data = await getBuffer(`https://nodejs.org/download/release/v${Version}/node-v${Version}-linux-${arch}.tar.gz`).catch(err => err);
  if (!Buffer.isBuffer(data)) return undefined;
  fs.writeFileSync(tarPath, data);
  return {tarPath, Version, arch};
}

async function extractTar(tarFile: string, to: string) {
  console.log("Extracting tar: %s, to: %s", tarFile, to);
  if (fs.existsSync(to)) {
    await fs.promises.rm(to, {recursive: true, force: true});
    await fs.promises.mkdir(to, {recursive: true});
  } else await fs.promises.mkdir(to, {recursive: true});
  await tar.x({
    file: tarFile,
    Directory: true,
    cwd: to
  });
  await fs.promises.rm(tarFile);
  return to;
}

async function createDeb(VERSION: string, debArch: string, tmpExtract) {
  const debFilePath = path.join(process.cwd(), `nodejs_${VERSION}_${debArch}.deb`);
  if (fs.existsSync(debFilePath)) return debFilePath;
  const storageRoot = path.resolve(process.cwd(), "packages", debArch, VERSION);
  if (fs.existsSync(storageRoot)) {
    await fs.promises.rm(storageRoot, {recursive: true, force: true});
    await fs.promises.mkdir(storageRoot, {recursive: true});
  } else await fs.promises.mkdir(storageRoot, {recursive: true});
  const usrPath = path.join(storageRoot, "usr");
  if (fs.existsSync(usrPath)) {
    await fs.promises.rm(usrPath, {recursive: true, force: true});
    await fs.promises.mkdir(usrPath, {recursive: true});
  } else await fs.promises.mkdir(usrPath, {recursive: true});
  const debianPath = path.join(storageRoot, "DEBIAN");
  await new Promise(res => {
    for (const file of fs.readdirSync(path.resolve(tmpExtract, fs.readdirSync(tmpExtract)[0]))) {
      if (!/\.md|LICENSE/.test(file)) fs.renameSync(path.resolve(tmpExtract, fs.readdirSync(tmpExtract)[0], file), path.resolve(usrPath, file));
    }
    return res("");
  });
  await fs.promises.rm(tmpExtract, {recursive: true, force: true});
  // Create DEBIAN folder
  if (!fs.existsSync(debianPath)) fs.mkdirSync(debianPath, {recursive: true});
  // Create control file
  const controlFile = createDebConfig({
    packageName: "nodejs",
    Version: VERSION,
    arch: debArch as any,
    Maintainer: "Matheus Sampaio Queiroga <srherobrine20@gmail.com>",
    Section: "web",
    Priority: "optional",
    Homepage: "https://nodejs.org/en/",
    Description: {short: "Node.js event-based server-side javascript engine", long: ["Node.js is similar in design to and influenced by systems like", "Ruby's Event Machine or Python's Twisted.", ".", "It takes the event model a bit further - it presents the event", "loop as a language construct instead of as a library.", ".", "Node.js is bundled with several useful libraries to handle server tasks :", "System, Events, Standard I/O, Modules, Timers, Child Processes, POSIX,", "HTTP, Multipart Parsing, TCP, DNS, Assert, Path, URL, Query Strings."]},
    Depends: [{Package: "libc6", minVersion: ">= 2.17"}, {Package: "libgcc1", minVersion: ">= 1:4.2"}, {Package: "libstdc++6", minVersion: ">= 4.8"}, {Package: "python3-minimal"}, {Package: "ca-certificates"}],
    Conflicts: [{Package: "nodejs-dev"}, {Package: "nodejs-doc"}, {Package: "nodejs-legacy"}, {Package: "npm"}],
    Replaces: [{Package: "nodejs-dev", minVersion: "<= 0.8.22"}, {Package: "nodejs-legacy"}, {Package: " npm", minVersion: "<= 1.2.14"}],
    Provides: [{Package: "nodejs-dev"}, {Package: "nodejs-doc"}, {Package: "nodejs-legacy"}, {Package: "npm"}]
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

async function uploadReleaseFile(file: string) {
  return await uploadRelease("Sirherobrine23", "DebianNodejsFiles", args.ci, "debs", fs.readFileSync(file), path.parse(file).base).then(res => {
    console.log("Uploaded \"%s\" to Github Release, url: \"%s\"", file, res.url);
  }).catch(err => console.log(`Error on upload file "${file}", error:\n${err}`));
}

const archs = [];
  getGithubTags("nodejs", "node").then(data => data.map(a => a.ref.replace(/refs\/tags\/heads\/tags\/v|refs\/tags\/v/, "")).reverse()).then(async data => {
    const maxVersions = parseInt(process.env.MAXREQ||"40")||40;
    data = data.slice(0, maxVersions);
    if (args.arch === "all") archs.push("amd64", "arm64", "armhf", "ppc64el", "s390x"); else archs.push(args.arch);
    // Versions
    if (args.node_version === "all") {
      const toRemove = 5;
      while (true) {
        if (data.length <= 0) break;
        for (const arch of archs) {
          const versions = data.slice(0, toRemove);
          const { binTar, deb } = archFind.find(a => a.deb === arch);
          const downloads = await (await Promise.all(versions.map(version => downloadTar(version, binTar)))).filter(a => !!a);
          await Promise.all(downloads.map(ext => extractTar(ext.tarPath, path.join(tmpPath, `nodejs_${ext.Version}_${ext.arch}`)).then(to => createDeb(ext.Version, deb, to).then(deb => {
            console.log(`Created "${deb}"`);
            if (!!args.ci) return {
              data: await uploadReleaseFile(deb),
              file: deb
            };
            return {
              data: undefined,
              file: deb
            };
          }))));
        }
        data = data.slice(toRemove);
      }
    } else {
      await Promise.all(archs.map(arch => downloadTar(args.node_version, archFind.find(a => a.deb === arch).binTar).then(ext => extractTar(ext.tarPath, path.join(tmpPath, `nodejs_${ext.Version}_${ext.arch}`)).then(to => createDeb(ext.Version, archFind.find(a => a.deb === arch).deb, to).then(deb => {
        console.log(`Created "${deb}"`);
        return deb;
      })).catch(err => console.log(`Error on create deb for "${args.node_version}", error:\n${err}`)))));
    }
  });

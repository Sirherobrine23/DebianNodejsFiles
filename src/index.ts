import fs, {promises as fsPromise} from "fs";
import path from "path";
import child_process from "child_process";
import os from "os";
import * as toActions from "./actionsInstall";
import yargs from "yargs";
import tar from "tar";
import { getBuffer, uploadRelease } from "./httpRequest";
import createDebConfig from "./createDebConfig";

const tmpPath = path.resolve(process.cwd(), "nodejs_tmp");
if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, {recursive: true, force: true});
fs.mkdirSync(tmpPath, {recursive: true});

const archFind = [
  {deb: "amd64", binTar: "x64", dockerPlatform: "linux/amd64"},
  {deb: "arm64", binTar: "arm64", dockerPlatform: "linux/arm64"},
  {deb: "armhf", binTar: "armv7l", dockerPlatform: "linux/arm/v7"},
  {deb: "armel", binTar: "armv6l", dockerPlatform: "linux/arm/v6"},
  {deb: "ppc64el", binTar: "ppc64el", dockerPlatform: "linux/ppc64le"},
  {deb: "s390x", binTar: "s390x", dockerPlatform: "linux/s390x"}
];

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
  if (fs.existsSync(to)) await fs.promises.rm(to, {recursive: true, force: true});
  await fs.promises.mkdir(to, {recursive: true});
  await tar.x({
    file: tarFile,
    Directory: true,
    cwd: to
  });
  await fs.promises.rm(tarFile);
  return to;
}

async function createDeb(VERSION: string, debArch: string, tmpExtract: string) {
  const debFilePath = path.join(process.cwd(), `nodejs_${VERSION}_${debArch}.deb`);
  const storageRoot = path.resolve(tmpPath, "packages", debArch, VERSION);
  const usrPath = path.join(storageRoot, "usr");
  const debianPath = path.join(storageRoot, "DEBIAN");
  if (fs.existsSync(debFilePath)) return debFilePath;
  if (fs.existsSync(storageRoot)) await fs.promises.rm(storageRoot, {recursive: true, force: true});
  await fs.promises.mkdir(storageRoot, {recursive: true});
  await fs.promises.mkdir(usrPath, {recursive: true});
  await fsPromise.cp(tmpExtract, usrPath, {recursive: true, force: true});
  await fs.promises.rm(tmpExtract, {recursive: true, force: true});
  // Create DEBIAN folder
  if (!fs.existsSync(debianPath)) fs.mkdirSync(debianPath, {recursive: true});
  // Create control file
  const controlFile = createDebConfig({
    packageName: "nodejs",
    Version: VERSION.replace(/[A-Za-z]+/, ""),
    arch: debArch as any,
    Maintainer: "Matheus Sampaio Queiroga <srherobrine20@gmail.com>",
    Section: "web",
    Priority: "optional",
    Homepage: "https://nodejs.org/",
    Description: {short: "Node.js event-based server-side javascript engine", long: ["Node.js is similar in design to and influenced by systems like", "Ruby's Event Machine or Python's Twisted.", ".", "It takes the event model a bit further - it presents the event", "loop as a language construct instead of as a library.", ".", "Node.js is bundled with several useful libraries to handle server tasks :", "System, Events, Standard I/O, Modules, Timers, Child Processes, POSIX,", "HTTP, Multipart Parsing, TCP, DNS, Assert, Path, URL, Query Strings."]},
    Depends: [{Package: "libc6", minVersion: ">= 2.17"}, {Package: "libgcc1", minVersion: ">= 1:4.2"}, {Package: "libstdc++6", minVersion: ">= 4.8"}, {Package: "ca-certificates"}],
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
  // fs.rmSync(storageRoot, {recursive: true, force: true});
  return debFilePath;
}

async function uploadReleaseFile(Token: string, file: string, fileName: string, tagName?: string) {
  return await uploadRelease("Sirherobrine23", "DebianNodejsFiles", Token, tagName?tagName:"debs", fs.readFileSync(file), fileName).then(res => {
    console.log("Uploaded \"%s\" to Github Release, url: \"%s\"", file, res.url);
  }).catch(err => console.log(`Error on upload file "${file}", error:\n${err}`));
}

const getNodeVersions = () => getBuffer("https://nodejs.org/dist/index.json").then(res => JSON.parse(res.toString())) as Promise<Array<{
  version: string
  date: string
  files: Array<string>
  npm?: string
  v8: string
  uv?: string
  zlib?: string
  openssl?: string
  modules?: string
  lts: Boolean|string
  security: boolean
}>>;

const Yargs = yargs(process.argv.slice(2)).command("clear", "Clear temp dir", () => fsPromise.rm(tmpPath, {recursive: true, force: true})).command("build", "Build with Docker and create DEB file", async yargs => {
  const nodejsVersionsPrebuild = await getNodeVersions();
  const {arch, version, show_log_build} = yargs.option("arch", {
    demandOption: false,
    describe: "Architecture to build and create DEB file",
    choices: [...(archFind.map(x => x.deb)), "all"],
    default: "all",
    type: "string"
  }).option("version", {
    demandOption: false,
    describe: "Node.js version to build and create DEB file",
    default: nodejsVersionsPrebuild[0].version,
    alias: "v",
    type: "string"
  }).option("show_log_build", {
    demandOption: false,
    describe: "??",
    default: false,
    alias: "s",
    type: "boolean"
  }).parseSync();
  const reGex = new RegExp(`^${version.startsWith("v")?"":"v"}${version.replace(".x", ".*")}`);
  const VersionsSearched = nodejsVersionsPrebuild.filter(nodejsVersion => reGex.test(nodejsVersion.version));
  if (VersionsSearched.length === 0) {
    console.log("Version not found");
    return;
  }
  const archs = arch === "all" ? archFind.map(x => x.deb) : [arch];
  for (const nodejsVersion of VersionsSearched.map(x => x.version).slice(-1)) {
    for (const arch of archs) {
      console.log("Building Node.js\nversion: %s\nto arch: %s\n\n", nodejsVersion, arch);
      const { deb } = archFind.find(a => a.deb === arch);
      const gitRepoPath = path.join(os.tmpdir(), `nodejs_${nodejsVersion.replace(/\./gi, "_")}_${deb}`);
      if (fs.existsSync(gitRepoPath)) await fsPromise.rm(gitRepoPath, {recursive: true, force: true});
      const debFolder = path.join(tmpPath, `DebNodejs_${nodejsVersion.replace(/\./gi, "_")}_${deb}`);
      if (fs.existsSync(debFolder)) await fsPromise.rm(debFolder, {recursive: true, force: true});
      await fsPromise.mkdir(debFolder, {recursive: true});
      await toActions.install(deb as any);
      await toActions.debianInstallPackages(["curl", "wget", "git", "python3", "g++", "make", "python3-pip", "tar"]);
      // Clone repo
      await toActions.runAsync({
        command: "git",
        args: ["clone", "-b", nodejsVersion.trim(), "--single-branch", "--depth", "1", "https://github.com/nodejs/node.git", gitRepoPath]
      });
      // ./configure --prefix=/tmp/build
      const args = ["--verbose", `--prefix=${debFolder}/usr`, "--dest-os=linux"];
      const env: {[key:string]: string} = {
        CXX_host: "g++",
        CC_host: "gcc"
      };
      console.log("Configuring target build");
      if (arch === "arm64") {
        args.push("--with-arm-float-abi=hard", "--with-arm-fpu=neon", "--dest-cpu=arm64");
        env.CXX = "aarch64-linux-gnu-g++"
        env.CC = "aarch64-linux-gnu-gcc"
        env.LD = "aarch64-linux-gnu-g++"
      } else if (arch === "armhf") {
        args.push("--dest-cpu=arm", "--without-snapshot", "--with-arm-float-abi=softpf");
        env.CXX = "arm-linux-gnueabihf-g++"
        env.CC = "arm-linux-gnueabihf-gcc"
        env.AR = "arm-linux-gnueabihf-ar"
        env.LINK = "arm-linux-gnueabihf-g++"
      } else if (arch === "armel") {
        args.push("--dest-cpu=arm", "--without-snapshot", "--with-arm-float-abi=softpf");
        env.CXX = "arm-linux-gnueabi-g++"
        env.CC = "arm-linux-gnueabi-gcc"
        env.AR = "arm-linux-gnueabi-ar"
        env.LINK = "arm-linux-gnueabi-g++"
      } else if (arch === "ppc64le") {
        args.push("--with-ppc-float=hard", "--dest-cpu=ppc64");
        env.CXX = "powerpc64le-linux-gnu-g++"
        env.CC = "powerpc64le-linux-gnu-gcc"
      } else if (arch === "s390x") {
        args.push("--dest-cpu=s390x");
        env.CXX = "s390x-linux-gnu-g++"
        env.CC = "s390x-linux-gnu-gcc"
      }
      if (arch === "arm64"||arch === "armhf"||arch === "armel"||arch === "ppc64le"||arch === "s390x") args.push("--cross-compiling");
      await toActions.runAsync({
        command: "./configure",
        args: args
      }, {
        cwd: gitRepoPath,
        env
      });
      console.log("Building target build");
      for (const arg of [[`-j${os.cpus().length}`], ["install", `PREFIX=${debFolder}/usr`]]) {
        try {
          await toActions.runAsync({
            command: "make",
            args: arg
          }, {
            cwd: gitRepoPath,
            env,
            stdio: show_log_build ? "tty" : "ignore"
          });
        } catch (err) {
          console.log(err?.stderr||err?.stdout||err);
          throw new Error("Build failed");
        }
      }
      // Create deb file
      const DebFilePath = await createDeb(nodejsVersion, deb, debFolder);
      // Upload to Github Releases
      console.log("\n************\n");
      console.log("Path file: \"%s\"", DebFilePath);
      console.log("\n************\n");
    }
  }
}).command("static", "Get static files and create DEB file", async yargs => {
  const nodejsVersionsPrebuild = await getNodeVersions();
  const { arch, ci, node_version } = yargs.option("ci", {
    demandOption: false,
    describe: "Upload to Github Releases",
    default: "",
    alias: "c"
  }).options("arch", {
    demandOption: false,
    describe: "The architecture of the package",
    default: "all",
    choices: ["amd64", "arm64", "armhf", "i386", "ppc64le", "s390x", "all"],
    alias: "a",
  }).option("node_version", {
    demandOption: false,
    describe: "The version of the package",
    default: "latest",
    alias: "n",
  }).parseSync();
  let Ver = nodejsVersionsPrebuild[0].version;
  if (!(/latest|current/.test(node_version))) {
    const reGex = new RegExp(`^${node_version.replace(".x", ".*")}`);
    const versionsFilted = nodejsVersionsPrebuild.filter(nodejsVersion => reGex.test(nodejsVersion.version));
    if (versionsFilted.length === 0) {
      console.log("No version found");
      return;
    }
    Ver = versionsFilted[0].version;
  }
  const archs = arch === "all" ? ["amd64", "arm64", "armhf", "i386", "ppc64le", "s390x"] : [arch];
  for (const arch of archs) {
    const { binTar, deb } = archFind.find(a => a.deb === arch);
    // Download tar
    const DebFilePath = await downloadTar(Ver, binTar).then(ext => extractTar(ext.tarPath, path.join(tmpPath, `nodejs_${ext.Version}_${ext.arch}`)).then(to => createDeb(ext.Version, deb, to)));
    // Upload to Github Releases
    if (ci) {
      console.log("Uploading to Github Releases and delete file");
      await uploadReleaseFile(ci, DebFilePath, `nodejs_${deb}.deb`, Ver);
      console.log("Uploaded \"%s\" to Github Releases", DebFilePath);
      await fsPromise.rm(DebFilePath);
    } else console.log("Path file: \"%s\"", DebFilePath);
  }
}).version(false).command({command: "*", handler: () => {Yargs.showHelp();}});
Yargs.parseAsync().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
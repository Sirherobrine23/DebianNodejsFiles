import fs, { promises as fsPromise } from "fs";
import path from "path";
import child_process from "child_process";
import os from "os";
import * as toActions from "./actionsInstall";
import yargs from "yargs";
import tar from "tar";
import { getBuffer } from "./httpRequest";
import createDebConfig from "./createDebConfig";

const tmpPath = path.resolve(process.cwd(), "nodejs_tmp");
if (fs.existsSync(tmpPath))
  fs.rmSync(tmpPath, { recursive: true, force: true });
fs.mkdirSync(tmpPath, { recursive: true });

const archFind = [
  { deb: "amd64", binTar: "x64", dockerPlatform: "linux/amd64" },
  { deb: "arm64", binTar: "arm64", dockerPlatform: "linux/arm64" },
  { deb: "armhf", binTar: "armv7l", dockerPlatform: "linux/arm/v7" },
  { deb: "armel", binTar: "armv6l", dockerPlatform: "linux/arm/v6" },
  { deb: "ppc64el", binTar: "ppc64el", dockerPlatform: "linux/ppc64le" },
  { deb: "s390x", binTar: "s390x", dockerPlatform: "linux/s390x" },
];

async function downloadTar(Version: string, arch: string) {
  if (!/^v.*$/.test(Version)) Version = "v"+Version;
  console.log("Downloading tar to arch: %s, version: %s", arch, Version);
  const tarRoot = path.resolve(tmpPath, "tar_gz");
  if (fs.existsSync(tarRoot)) {
    fs.rmSync(tarRoot, { recursive: true, force: true });
    fs.mkdirSync(tarRoot, { recursive: true });
  } else fs.mkdirSync(tarRoot, { recursive: true });
  const tarPath = path.join(tarRoot, `node-${Version}-linux-${arch}.tar.gz`);
  const data = await getBuffer(`https://nodejs.org/download/release/${Version}/node-${Version}-linux-${arch}.tar.gz`);
  if (!Buffer.isBuffer(data)) return undefined;
  fs.writeFileSync(tarPath, data);
  return { tarPath, Version, arch };
}

async function extractTar(tarFile: string, to: string) {
  console.log("Extracting tar: %s, to: %s", tarFile, to);
  if (fs.existsSync(to))
    await fs.promises.rm(to, { recursive: true, force: true });
  await fs.promises.mkdir(to, { recursive: true });
  await tar.x({
    file: tarFile,
    Directory: true,
    cwd: to,
  });
  await fs.promises.rm(tarFile);
  return to;
}

async function createDeb(VERSION: string, debArch: string, tmpExtract: string) {
  const debFilePath = path.join(
    process.cwd(),
    `nodejs_${VERSION}_${debArch}.deb`
  );
  const storageRoot = path.resolve(tmpPath, "packages", debArch, VERSION);
  const usrPath = path.join(storageRoot, "usr");
  const debianPath = path.join(storageRoot, "DEBIAN");
  if (fs.existsSync(debFilePath)) return debFilePath;
  if (fs.existsSync(storageRoot))
    await fs.promises.rm(storageRoot, { recursive: true, force: true });
  await fs.promises.mkdir(storageRoot, { recursive: true });
  await fs.promises.mkdir(usrPath, { recursive: true });
  await fsPromise.cp(tmpExtract, usrPath, { recursive: true, force: true });
  await fs.promises.rm(tmpExtract, { recursive: true, force: true });
  // Create DEBIAN folder
  if (!fs.existsSync(debianPath)) fs.mkdirSync(debianPath, { recursive: true });
  // Create control file
  const controlFile = createDebConfig({
    packageName: "nodejs",
    Version: VERSION.replace(/[A-Za-z]+/, ""),
    arch: debArch as any,
    Maintainer: "Matheus Sampaio Queiroga <srherobrine20@gmail.com>",
    Section: "web",
    Priority: "optional",
    Homepage: "https://nodejs.org/",
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
        "HTTP, Multipart Parsing, TCP, DNS, Assert, Path, URL, Query Strings.",
      ],
    },
    Depends: [
      { Package: "libc6", minVersion: ">= 2.17" },
      { Package: "libgcc1", minVersion: ">= 1:4.2" },
      { Package: "libstdc++6", minVersion: ">= 4.8" },
      { Package: "ca-certificates" },
    ],
    Conflicts: [
      { Package: "nodejs-dev" },
      { Package: "nodejs-doc" },
      { Package: "nodejs-legacy" },
      { Package: "npm" },
    ],
    Replaces: [
      { Package: "nodejs-dev", minVersion: "<= 0.8.22" },
      { Package: "nodejs-legacy" },
      { Package: " npm", minVersion: "<= 1.2.14" },
    ],
    Provides: [
      { Package: "nodejs-dev" },
      { Package: "nodejs-doc" },
      { Package: "nodejs-legacy" },
      { Package: "npm" },
    ],
  });
  fs.writeFileSync(path.join(debianPath, "control"), controlFile);
  await new Promise((res, rej) => {
    const proc = child_process.execFile(
      "dpkg-deb",
      ["--build", "--verbose", ".", debFilePath],
      { cwd: storageRoot },
      (err) => (err ? rej(err) : res(null))
    );
    proc.stdout.on("data", (data) => process.stdout.write(data));
    proc.stderr.on("data", (data) => process.stderr.write(data));
  });
  // fs.rmSync(storageRoot, {recursive: true, force: true});
  return debFilePath;
}

const getNodeVersions = () =>
  getBuffer("https://nodejs.org/dist/index.json").then((res) =>
    JSON.parse(res.toString())
  ) as Promise<
    Array<{
      version: string;
      date: string;
      files: Array<string>;
      npm?: string;
      v8: string;
      uv?: string;
      zlib?: string;
      openssl?: string;
      modules?: string;
      lts: Boolean | string;
      security: boolean;
    }>
  >;

const Yargs = yargs(process.argv.slice(2))
  .command("clear", "Clear temp dir", () =>
    fsPromise.rm(tmpPath, { recursive: true, force: true })
  )
  .command("build", "Build with Docker and create DEB file", async (yargs) => {
    const nodejsVersionsPrebuild = await getNodeVersions();
    const { arch, version, show_log_build } = yargs
      .option("arch", {
        demandOption: false,
        describe: "Architecture to build and create DEB file",
        choices: [...archFind.map((x) => x.deb), "all"],
        default: "all",
        type: "string",
      })
      .option("version", {
        demandOption: false,
        describe: "Node.js version to build and create DEB file",
        default: nodejsVersionsPrebuild[0].version,
        alias: "v",
        type: "string",
      })
      .option("show_log_build", {
        demandOption: false,
        describe: "??",
        default: false,
        alias: "s",
        type: "boolean",
      })
      .parseSync();
    const reGex = new RegExp(
      `^${version.startsWith("v") ? "" : "v"}${version.replace(".x", ".*")}`
    );
    const VersionsSearched = nodejsVersionsPrebuild.filter((nodejsVersion) =>
      reGex.test(nodejsVersion.version)
    );
    if (VersionsSearched.length === 0) {
      console.log("Version not found");
      return;
    }
    const archs = arch === "all" ? archFind.map((x) => x.deb) : [arch];
    for (const nodejsVersion of VersionsSearched.map((x) => x.version).slice(
      -1
    )) {
      for (const arch of archs) {
        console.log(
          "Building Node.js\nversion: %s\nto arch: %s\n\n",
          nodejsVersion,
          arch
        );
        const { deb } = archFind.find((a) => a.deb === arch);
        const gitRepoPath = path.join(
          os.tmpdir(),
          `nodejs_${nodejsVersion.replace(/\./gi, "_")}_${deb}`
        );
        if (fs.existsSync(gitRepoPath))
          await fsPromise.rm(gitRepoPath, { recursive: true, force: true });
        const debFolder = path.join(
          tmpPath,
          `DebNodejs_${nodejsVersion.replace(/\./gi, "_")}_${deb}`
        );
        if (fs.existsSync(debFolder))
          await fsPromise.rm(debFolder, { recursive: true, force: true });
        await fsPromise.mkdir(debFolder, { recursive: true });
        await toActions.debianInstallPackages([
          "curl",
          "wget",
          "git",
          "python3",
          "g++",
          "make",
          "python3-pip",
          "tar",
          "gcc-multilib",
          "g++-multilib",
          "linux-libc-dev",
          "musl",
          "libglib*",
        ]);
        // Clone repo
        await toActions.runAsync({
          command: "git",
          args: [
            "clone",
            "-b",
            nodejsVersion.trim(),
            "--single-branch",
            "--depth",
            "1",
            "https://github.com/nodejs/node.git",
            gitRepoPath,
          ],
        });
        // ./configure --prefix=/tmp/build
        const args = [`--prefix=${debFolder}/usr`, "--dest-os=linux"];
        const env: { [key: string]: string } = {
          CXX_host: "g++",
          CC_host: "gcc",
        };
        console.log("Configuring target build");
        if (arch === "arm64") {
          args.push(
            "--with-arm-float-abi=hard",
            "--with-arm-fpu=neon",
            "--dest-cpu=arm64"
          );
          env.CXX = "aarch64-linux-gnu-g++";
          env.CC = "aarch64-linux-gnu-gcc";
          env.LD = "aarch64-linux-gnu-g++";
          await toActions.debianInstallPackages([
            "binutils-aarch64-linux-gnu",
            "gcc-aarch64-linux-gnu",
            "g++-aarch64-linux-gnu",
          ]);
        } else if (arch === "armhf") {
          args.push("--dest-cpu=arm");
          const TOOL_PREFIX = "arm-linux-gnueabihf";
          env.TOOL_PREFIX = TOOL_PREFIX;
          env.CC = `${TOOL_PREFIX}-gcc`;
          env.CXX = `${TOOL_PREFIX}-g++`;
          env.AR = `${TOOL_PREFIX}-ar`;
          env.RANLIB = `${TOOL_PREFIX}-ranlib`;
          env.LINK = env.CXX;
          env.CCFLAGS =
            "-march=armv7-a -mtune=cortex-a8 -mfpu=vfp -mfloat-abi=hard -DUSE_EABI_HARDFLOAT";
          env.CXXFLAGS =
            "-march=armv7-a -mtune=cortex-a8 -mfpu=vfp -mfloat-abi=hard -DUSE_EABI_HARDFLOAT";
          env.OPENSSL_armcap = "7";
          env.GYPFLAGS =
            "-Darmeabi=hard -Dv8_use_arm_eabi_hardfloat=true -Dv8_can_use_vfp3_instructions=true -Dv8_can_use_vfp2_instructions=true -Darm7=1";
          env.VFP3 = "on";
          env.VFP2 = "on";
          await toActions.debianInstallPackages([
            "binutils-arm-linux-gnueabihf",
            "gcc-arm-linux-gnueabihf",
            "g++-arm-linux-gnueabihf",
          ]);
          args.push("--with-arm-float-abi=hard", "--with-arm-fpu=neon");
        } else if (arch === "ppc64le") {
          args.push("--with-ppc-float=hard", "--dest-cpu=ppc64");
          env.CXX = "powerpc64le-linux-gnu-g++";
          env.CC = "powerpc64le-linux-gnu-gcc";
          await toActions.debianInstallPackages([
            "binutils-powerpc64le-linux-gnu",
            "gcc-powerpc64le-linux-gnu",
            "g++-powerpc64le-linux-gnu",
          ]);
        } else if (arch === "s390x") {
          args.push("--dest-cpu=s390x");
          env.CXX = "s390x-linux-gnu-g++";
          env.CC = "s390x-linux-gnu-gcc";
          await toActions.debianInstallPackages([
            "binutils-s390x-linux-gnu",
            "gcc-s390x-linux-gnu",
            "g++-s390x-linux-gnu",
          ]);
        }
        if (arch === "arm64" || arch === "armhf" || arch === "armel" || arch === "ppc64le" || arch === "s390x")
          args.push("--cross-compiling");
        await toActions.runAsync(
          {
            command: "./configure",
            args: args,
          },
          {
            cwd: gitRepoPath,
            env,
          }
        );
        console.log("Building target build");
        for (const arg of [
          [`-j${os.cpus().length}`],
          ["install", `PREFIX=${debFolder}/usr`],
        ]) {
          try {
            await toActions.runAsync(
              {
                command: "make",
                args: arg,
              },
              {
                cwd: gitRepoPath,
                env,
                stdio: show_log_build ? "tty" : "ignore",
              }
            );
          } catch (err) {
            console.log(err?.stderr || err?.stdout || err);
            throw new Error("Build failed");
          }
        }
        // Create deb file
        const DebFilePath = await createDeb(nodejsVersion, deb, debFolder);
        // Upload to Github Releases
        console.log("\n************\n");
        console.log('Path file: "%s"', DebFilePath);
        console.log("\n************\n");
      }
    }
  })
  .command("static", "Get static files and create DEB file", async (yargs) => {
    const nodejsVersionsPrebuild = await getNodeVersions();
    const { arch, node_version } = yargs
      .options("arch", {
        demandOption: false,
        describe: "The architecture of the package",
        default: "all",
        choices: ["amd64", "arm64", "armhf", "i386", "ppc64le", "s390x", "all"],
        alias: "a",
      })
      .option("node_version", {
        demandOption: false,
        describe: "The version of the package",
        default: "latest",
        alias: "n",
      })
      .parseSync();
    let Ver = nodejsVersionsPrebuild[0].version;
    if (!/latest|current/.test(node_version)) {
      const reGex = new RegExp(`^${node_version.replace(".x", ".*")}`);
      const versionsFilted = nodejsVersionsPrebuild.filter((nodejsVersion) =>
        reGex.test(nodejsVersion.version)
      );
      if (versionsFilted.length === 0) {
        console.log("No version found");
        return;
      }
      Ver = versionsFilted[0].version;
    }
    const archs = arch === "all" ? ["amd64", "arm64", "armhf", "i386", "ppc64le", "s390x"] : [arch];
    for (const arch of archs) {
      const { binTar, deb } = archFind.find((a) => a.deb === arch);
      // Download tar
      const tarInfo = await downloadTar(Ver, binTar);
      console.log(tarInfo);
      const tarFolder = await extractTar(tarInfo.tarPath, path.join(tmpPath, `nodejs_${tarInfo.Version}_${tarInfo.arch}`));
      console.log(tarFolder);
      const DebFilePath = await createDeb(tarInfo.Version, deb, tarFolder);
      console.log('Path file: "%s"', DebFilePath);
    }
  })
  .version(false)
  .command({
    command: "*",
    handler: () => {
      Yargs.showHelp();
    },
  });
Yargs.parseAsync()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err));
    process.exit(1);
  });

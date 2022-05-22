import child_process from "child_process";

type runCommand = {command: string, args?: Array<string|number>};
type runCommandOptions = {
  env?: {[key: string]: string|number},
  cwd?: string,
  stdio?: "tty"|"ignore"
};
export function runAsync(commands: runCommand, options: runCommandOptions = {}): Promise<{stdout: string, stderr: string}> {
  let __showRun = "";
  if (!commands.args) commands.args = [];
  if (!options.stdio) options.stdio = "tty";
  if (options.cwd) __showRun += `cd ${options.cwd} && `;
  const env: {[key: string]: string} = {...process.env};
  if (options?.env) {
    for (const key in options.env) {
      env[key] = String(options.env[key]);
      __showRun += `${key}=${env[key]} `
    }
  }
  __showRun += `${commands.command} ${commands.args.join(" ")}`;
  console.log(__showRun);
  return new Promise((resolve, reject) => {
    const exec = child_process.execFile(commands.command, commands.args.map(String), {
      cwd: options?.cwd||process.cwd(),
      maxBuffer: Infinity,
      env: env
    }, (error, stdout, stderr) => {
      if (error) return reject({error, stdout, stderr});
      return resolve({stdout, stderr});
    });
    if (options.stdio === "tty") {
      exec.stdout.on("data", data => process.stdout.write(data));
      exec.stderr.on("data", data => process.stderr.write(data));
    }
  });
}

export async function debianInstallPackages(packages: Array<string>): Promise<void> {
  if (packages.length === 0) throw new Error("No packages to install");
  await runAsync({command: "sudo", args: ["apt", "install", "-y", ...packages]}, {
    env: {
      DEBIAN_FRONTEND: "noninteractive"
    }
  });
}

export async function install(target: "amd64"|"arm64"|"armhf"|"armel"|"ppc64el"|"s390x"): Promise<void> {
  if (process.arch === "x64") {
    if (target === "amd64") {
      return;
    } else if (target === "arm64") {
      await debianInstallPackages(["binutils-aarch64-linux-gnu", "gcc-aarch64-linux-gnu", "g++-aarch64-linux-gnu"]);
      return;
    } else if (target === "armhf") {
      await debianInstallPackages(["binutils-arm-linux-gnueabihf", "gcc-arm-linux-gnueabihf", "g++-arm-linux-gnueabihf"]);
      return;
    } else if (target === "armel") {
      await debianInstallPackages(["binutils-arm-linux-gnueabi", "gcc-arm-linux-gnueabi", "g++-arm-linux-gnueabi"]);
      return;
    } else if (target === "ppc64el") {
      await debianInstallPackages(["binutils-powerpc-linux-gnu", "gcc-powerpc-linux-gnu", "g++-powerpc-linux-gnu"]);
      return;
    } else if (target === "s390x") {
      await debianInstallPackages(["binutils-s390x-linux-gnu", "gcc-s390x-linux-gnu", "g++-s390x-linux-gnu"]);
      return;
    }
  }
  throw new Error("Unsupported architecture");
}
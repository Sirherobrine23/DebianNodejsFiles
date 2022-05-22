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
  await runAsync({command: "sudo", args: ["apt", "update"]}, {stdio: "ignore"});
  await runAsync({command: "sudo", args: ["apt", "install", "-y", ...packages]}, {
    env: {
      DEBIAN_FRONTEND: "noninteractive"
    }
  });
}
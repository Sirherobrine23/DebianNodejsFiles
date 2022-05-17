type extraConfig = {
  packageName: string;
  Version: string|Array<number|string>;
  arch: "amd64"|"arm64"|"armhf"|"armel"|"ppc64el"|"s390x";
  Maintainer: string;
  Depends?: Array<{Package: string; minVersion?: string;}>;
  Conflicts?: Array<{Package: string;}>;
  Replaces?: Array<{Package: string; minVersion?: string;}>;
  Provides?: Array<{Package: string;}>;
  Section?: string|Array<string>;
  Priority?: string;
  Homepage?: string;
  Description?: {
    short: string;
    long: string|Array<string>;
  }
}
export default function createConfig(moreConfig: extraConfig) {
  const lines: Array<string> = [`Package: ${moreConfig.packageName}`, `Architecture: ${moreConfig.arch}`];
  if (Array.isArray(moreConfig.Version)) lines.push(`Version: ${moreConfig.Version.join(".")}`);
  else lines.push(`Version: ${moreConfig.Version}`);
  lines.push(`Maintainer: ${moreConfig.Maintainer}`);
  if (moreConfig.Depends) lines.push(`Depends: ${moreConfig.Depends.map(dep => dep.minVersion === undefined ? dep.Package:`${dep.Package} (${dep.minVersion})`).join(", ")}`);
  if (moreConfig.Conflicts) lines.push(`Conflicts: ${moreConfig.Conflicts.map(conflict => conflict.Package).join(", ")}`);
  if (moreConfig.Replaces) lines.push(`Replaces: ${moreConfig.Replaces.map(replace => replace.minVersion === undefined ? replace.Package:`${replace.Package} (${replace.minVersion})`).join(", ")}`);
  if (moreConfig.Provides) lines.push(`Provides: ${moreConfig.Provides.map(provide => provide.Package).join(", ")}`);
  if (moreConfig.Section) {
    if (Array.isArray(moreConfig.Section)) lines.push(`Section: ${moreConfig.Section.join(", ")}`);
    else lines.push(`Section: ${moreConfig.Section}`);
  }
  if (moreConfig.Priority) lines.push(`Priority: ${moreConfig.Priority}`);
  if (moreConfig.Homepage) {
    if (!/http[s]:\/\/.*/.test(moreConfig.Homepage)) throw new Error("Homepage must be a valid URL");
    lines.push(`Homepage: ${moreConfig.Homepage}`);
  }
  if (moreConfig.Description) {
    lines.push(`Description: ${moreConfig.Description.short}`);
    if (Array.isArray(moreConfig.Description.long)) lines.push(` ${moreConfig.Description.long.join("\n ")}`);
    else lines.push(` ${moreConfig.Description.long}`);
  }
  return lines.join("\n")+"\n";
}
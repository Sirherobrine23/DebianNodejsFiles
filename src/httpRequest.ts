import axios from "axios";

type githubRelease = {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  tarball_url: string;
  zipball_url: string;
  body: string;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: Array<{
    url: string;
    id: number;
    node_id: string;
    name: string;
    label: string;
    content_type: string;
    state: string;
    size: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    browser_download_url: string;
    uploader: {
      login: string;
      id: number;
      node_id: string;
      avatar_url: string;
      gravatar_id: string;
      url: string;
      html_url: string;
      followers_url: string;
      following_url: string;
      gists_url: string;
      starred_url: string;
      subscriptions_url: string;
      organizations_url: string;
      repos_url: string;
      events_url: string;
      received_events_url: string;
      type: string;
      site_admin: boolean;
    };
  }>;
};

type githubUpload = {
  url: string;
  browser_download_url: string;
  id: number;
  node_id: string;
  name: string;
  label: string;
  state: string;
  content_type: string;
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  uploader: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: true|false
  }
}

export async function getBuffer(url: string, headers?: {[d: string]: any}): Promise<Buffer> {
  const dataReponse = await axios.get(url, {
    headers: (headers||{}),
    responseType: "arraybuffer",
  });
  return Buffer.from(dataReponse.data);
}

export async function postFileBuffer(url: string, file: Buffer|Object, headers?: {[d: string]: any}): Promise<Buffer> {
  const dataReponse = await axios.post(url, file, {
    headers: (headers||{}),
    responseType: "arraybuffer",
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return Buffer.from(dataReponse.data);
}

export async function uploadRelease(Username: string, Repo: string, token: string, releaseName: string, file: Buffer, fileName: string): Promise<githubUpload|undefined> {
  let ifExistRelease: githubRelease = (await getGithubRelease(Username, Repo, token)).find(release => release.tag_name === releaseName);
  if (!ifExistRelease) {
    ifExistRelease = await postFileBuffer(`https://api.github.com/repos/${Username}/${Repo}/releases`, {
      tag_name: releaseName,
      name: releaseName,
      draft: false,
      prerelease: false,
    }, {
      Authorization: `token ${token}`
    }).then(res => JSON.parse(res.toString("utf8"))) as githubRelease;
  }
  if (ifExistRelease.assets.find(asset => asset.name === fileName)) return undefined;
  const uploadDate: githubUpload = await postFileBuffer(`https://uploads.github.com/repos/${Username}/${Repo}/releases/${ifExistRelease.id}/assets?name=${fileName}`, file, {
    Authorization: `token ${token}`,
    "Content-Type": "application/octet-stream"
  }).then(res => JSON.parse(res.toString("utf8")));
  return uploadDate;
}

export async function getGithubRelease(Username: string, Repo: string, token?: string): Promise<Array<githubRelease>> {
  const data = await getBuffer(`https://api.github.com/repos/${Username}/${Repo}/releases?per_page=100`, {
    Authorization: `token ${token||""}`
  });
  return JSON.parse(data.toString("utf8"));
}

export async function getGithubTags(Username: string, Repo: string): Promise<Array<{ref: string; node_id: string; url: string; object: {sha: string; type: string; url: string;}}>> {
  const data = await getBuffer(`https://api.github.com/repos/${Username}/${Repo}/git/refs/tags?per_page=100`);
  return JSON.parse(data.toString("utf8"));
}
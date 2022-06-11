#!/bin/bash
set -ex
[[ -z "${ARCH}" ]] && ARCH=$(dpkg --print-architecture)
DEB_URL=$(wget -qO- https://api.github.com/repos/Sirherobrine23/DebianNodejsFiles/releases | grep 'browser_download_url' | grep $ARCH | cut -d '"' -f 4 | sort | uniq | tail -n 1)
wget "${DEB_URL}" -q -O /tmp/nodejs.deb
dpkg -i /tmp/nodejs.deb
rm -rfv /tmp/nodejs.deb
npm install -g npm@latest
exit 0

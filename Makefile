# Create Packages
VERSION:=16.14.2

update_version:
	sed 's|Version: 0.0.1beta|Version: ${VERSION}|g' packages/*/DEBIAN/control

clean:
	rm -fr packages/*/usr tmp/ node*.tar.gz *.deb

amd64:
	wget 'https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-x64.tar.gz' -O node.tar.gz
	if [ -d 'tmp/' ];then rm -fr tmp/; fi
	mkdir tmp/
	tar -xzf node.tar.gz -C tmp/
	rm -fv tmp/*/LICENSE tmp/*/*.md node.tar.gz
	if [ -d 'packages/amd64/usr/' ];then rm -fr packages/amd64/usr/; fi
	mkdir -v packages/amd64/usr/
	mv -vf tmp/*/* packages/amd64/usr/
	dpkg-deb --build --verbose ./packages/amd64 ./nodejs_amd64.deb

arm64:
	wget 'https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-arm64.tar.gz' -O node.tar.gz
	if [ -d 'tmp/' ];then rm -fr tmp/; fi
	mkdir tmp/
	tar -xzf node.tar.gz -C tmp/
	rm -fv tmp/*/LICENSE tmp/*/*.md node.tar.gz
	if [ -d 'packages/arm64/usr/' ];then rm -fr packages/arm64/usr/; fi
	mkdir -v packages/arm64/usr/
	mv -vf tmp/*/* packages/arm64/usr/
	dpkg-deb --build --verbose ./packages/arm64 ./nodejs_arm64.deb

armv7l:
	wget 'https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-armv7l.tar.gz' -O node.tar.gz
	if [ -d 'tmp/' ];then rm -fr tmp/; fi
	mkdir tmp/
	tar -xzf node.tar.gz -C tmp/
	rm -fv tmp/*/LICENSE tmp/*/*.md node.tar.gz
	if [ -d 'packages/armv7l/usr/' ];then rm -fr packages/armv7l/usr/; fi
	mkdir -v packages/armv7l/usr/
	mv -vf tmp/*/* packages/armv7l/usr/
	dpkg-deb --build --verbose ./packages/armv7l ./nodejs_armv7l.deb

ppc64le:
	wget 'https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-ppc64le.tar.gz' -O node.tar.gz
	if [ -d 'tmp/' ];then rm -fr tmp/; fi
	mkdir tmp/
	tar -xzf node.tar.gz -C tmp/
	rm -fv tmp/*/LICENSE tmp/*/*.md node.tar.gz
	if [ -d 'packages/ppc64le/usr/' ];then rm -fr packages/ppc64le/usr/; fi
	mkdir -v packages/ppc64le/usr/
	mv -vf tmp/*/* packages/ppc64le/usr/
	dpkg-deb --build --verbose ./packages/ppc64le ./nodejs_ppc64le.deb

s390x:
	wget 'https://nodejs.org/download/release/v${VERSION}/node-v${VERSION}-linux-s390x.tar.gz' -O node.tar.gz
	if [ -d 'tmp/' ];then rm -fr tmp/; fi
	mkdir tmp/
	tar -xzf node.tar.gz -C tmp/
	rm -fv tmp/*/LICENSE tmp/*/*.md node.tar.gz
	if [ -d 'packages/s390x/usr/' ];then rm -fr packages/s390x/usr/; fi
	mkdir -v packages/s390x/usr/
	mv -vf tmp/*/* packages/s390x/usr/
	dpkg-deb --build --verbose ./packages/s390x ./nodejs_s390x.deb

all: update_version clean amd64 arm64 armv7l ppc64le s390x
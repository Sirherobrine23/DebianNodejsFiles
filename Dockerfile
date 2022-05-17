FROM debian:latest AS build
ENV DEBIAN_FRONTEND="noninteractive"
RUN apt update && apt install -y curl wget git python3 g++ make python3-pip tar
RUN mkdir /tmp/build
WORKDIR /buildNode
ARG NODE_VERSION="master"
RUN git clone https://github.com/nodejs/node.git -b "${NODE_VERSION:-master}" --single-branch --depth 1 node
WORKDIR /buildNode/node
RUN ./configure --prefix=/tmp/build
RUN make -j$(nproc) && make install PREFIX=/tmp/build
WORKDIR /tmp/build/
RUN tar -czf node.tar.gz *

FROM scratch as bins
COPY --from=build /tmp/build/node.tar.gz /

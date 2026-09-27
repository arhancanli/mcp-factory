// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them live and
// stores the responses, compressed, in test/fixtures.
export const BROKEN = `ARG NODE_VERSION=18
FROM node:\${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:\${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=dep /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM python:3.8-slim-buster
MAINTAINER ops@example.com
ARG GITHUB_TOKEN
RUN apt-get update
RUN apt-get install curl git
COPY ../shared/config.yml /etc/app/
COPY --from=build /app/dist /srv
ENV DATABASE_PASSWORD=hunter2
EXPOSE 8080/http
USER root
CMD ['python', '-m', 'http.server', '8080']
`;

export const CLEAN = `# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
`;

export const ARM = `FROM mysql:5.7
COPY schema.sql /docker-entrypoint-initdb.d/
USER mysql
`;

export const IMAGES = ["node:18.99-alpine", "python:3.8-slim-buster", "ghcr.io/actions/actions-runner:2.328.0", "mcr.microsoft.com/dotnet/aspnet:6.0", "registry.k8s.io/pause:3.10", "quay.io/prometheus/node-exporter:v1.8.2", "public.ecr.aws/docker/library/alpine:3.20", "openjdk:17", "ghcr.io/nope/nothing:1"];

export const SCENARIOS = [
  { label: "check_dockerfile: a three-stage Dockerfile with twelve problems", tool: "check_dockerfile", args: { files: [{ path: "Dockerfile", content: BROKEN }] }, example: true },
  { label: "check_dockerfile: a clean two-stage Node.js build", tool: "check_dockerfile", args: { files: [{ path: "Dockerfile", content: CLEAN }] } },
  { label: "check_dockerfile: an amd64-only base image built for linux/arm64", tool: "check_dockerfile", args: { files: [{ path: "db/Dockerfile", content: ARM }], platform: "linux/arm64" } },
  { label: "image_info: nine references across seven registries", tool: "image_info", args: { images: IMAGES } },
];

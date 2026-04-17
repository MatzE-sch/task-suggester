FROM node:22-alpine AS builder

ARG PUBLIC_API_URL=http://localhost:8000
ENV PUBLIC_API_URL=$PUBLIC_API_URL

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .
RUN npm install --omit=dev

ENV PORT=3000
EXPOSE 3000
CMD ["node", "build"]

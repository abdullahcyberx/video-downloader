FROM node:20-alpine

# Install python, ffmpeg, curl and build tools for curl-cffi impersonation
RUN apk add --no-cache python3 py3-pip ffmpeg curl gcc musl-dev python3-dev libffi-dev

# Install yt-dlp curl-cffi via pip for browser impersonation to bypass YouTube Bot blocks
RUN pip3 install --break-system-packages curl-cffi

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.js"]

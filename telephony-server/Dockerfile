FROM node:20-slim
WORKDIR /app
COPY telephony-server/package.json ./package.json
COPY telephony-server/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
COPY telephony-server/src/ ./src/
EXPOSE 8080
CMD ["node", "src/index.js"] 

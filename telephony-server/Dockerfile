FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY telephony-server/src/ ./src/
# COPY lib/ ./lib/

EXPOSE 8080
CMD ["node", "src/index.js"]
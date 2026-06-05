FROM node:20-slim
WORKDIR /app
COPY telephony-server/package.json ./package.json
COPY telephony-server/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
COPY telephony-server/src/ ./src/
COPY lib/ ./lib/
RUN ls /app/ && ls /app/lib/ || echo "lib not found"
EXPOSE 8080
CMD ["node", "src/index.js"] 

FROM node

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . ./

ENTRYPOINT ["./start.sh"]

CMD ["--v2", "custom.js"]

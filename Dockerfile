FROM node:22

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm i -g pm2 && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 5M && \
    pm2 set pm2-logrotate:retain 1 && \
    pm2 set pm2-logrotate:compress true && \
    pm2 set pm2-logrotate:rotateInterval '0 0 */3 * *'

RUN npm install --include=dev

COPY . .

RUN npm run build

COPY start.sh /usr/src/app/start.sh
RUN chmod +x /usr/src/app/start.sh

EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.js"]

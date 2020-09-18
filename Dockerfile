# docker build -t geoos/geoserver:latest -t geoos/geoserver:0.33 .
# docker push geoos/geoserver:latest

FROM geoos/gdal-node14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production

COPY . .
CMD ["node", "index"]
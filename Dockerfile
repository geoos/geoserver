# docker build -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:0.42 .
# docker push docker.homejota.net/geoos/geoserver:latest

# docker build -t geoos/geoserver:latest -t geoos/geoserver:0.35 .
# docker push geoos/geoserver:latest

FROM geoos/gdal-node14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production

COPY . .
CMD ["node", "index"]
# desde el M1
# docker buildx build --push --platform linux/amd64 -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:0.51 .

# docker build -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:0.49 .
# docker push docker.homejota.net/geoos/geoserver:latest

FROM geoos/gdal-node14
EXPOSE 8080
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production

COPY . .
CMD ["node", "index"]
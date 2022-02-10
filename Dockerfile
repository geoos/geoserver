# desde el M1
# docker buildx build --push --platform linux/amd64 -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:0.65 .

# docker build -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:0.49 .
# docker push docker.homejota.net/geoos/geoserver:latest

#FROM docker.homejota.net/geoos/gdal-node14
FROM docker.homejota.net/geoos/gdal-node14-nco-cdo
EXPOSE 8080
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production

COPY . .
CMD ["node", "index"]
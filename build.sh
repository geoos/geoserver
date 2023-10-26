VERSION=1.01
docker buildx build --push --platform linux/amd64,linux/arm64 -t docker.homejota.net/geoos/geoserver:latest -t docker.homejota.net/geoos/geoserver:$VERSION .
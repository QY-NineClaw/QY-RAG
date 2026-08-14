date=$(date +%Y%m%d)
rm -rf QY-RAG_x86 *.tar.gz
mkdir QY-RAG_x86
cd ../QY-RAG
cp -rf ../NineClaw-Deploy/jenkins_util/load_images.sh ../NineClaw-Deploy/README.md deploy.sh docker-compose.yml docker_images env.example service_conf.yaml.template ../$JOB_NAME/QY-RAG_x86
cd ../$JOB_NAME/
tar -czvf ${package_prefix}_${date}.tar.gz ./QY-RAG_x86
cp ./${package_prefix}_${date}.tar.gz ${package_location}
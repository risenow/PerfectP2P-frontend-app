const fs = require("fs");
const glob = require("glob");
const path = require("node:path");

function makeDist() {
  const distDir = "./dist/";

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  const packageJSONStr = fs.readFileSync("./package.json", "utf8");
  const packageJSON = JSON.parse(packageJSONStr);

  const distFiles = packageJSON.files;
  for (let i = 0; i < distFiles.length; i++) {
    console.log("Master file card: " + distFiles[i]);
    const files = glob.sync(distFiles[i]);
    console.log(files);
    for (let j = 0; j < files.length; j++) {
      console.log("src: " + files[j]);
      console.log("dest: " + distDir + path.basename(files[j]));
      fs.copyFileSync(files[j], distDir + path.basename(files[j]));
    }
  }
}
makeDist();

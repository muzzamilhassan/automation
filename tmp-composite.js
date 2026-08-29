const sharp = require('sharp');
const fs = require('fs');
async function run() {
  const bg = await sharp('/tmp/bg.jpg').resize(1640, 624, { fit: 'cover', position: 'center' }).toBuffer();
  const svg = fs.readFileSync('/tmp/overlay.svg');
  await sharp(bg).composite([{ input: svg }]).jpeg({ quality: 95 }).toFile('/tmp/final-cover.jpg');
  console.log('Sharp composite finished');
}
run();
const parts = ($json.candidates && $json.candidates[0] && $json.candidates[0].content && $json.candidates[0].content.parts) || [];
const img = parts.find(p => p.inlineData && p.inlineData.data);
if (!img) throw new Error('Gemini returned no image: ' + JSON.stringify($json).substring(0, 250));
const buf = Buffer.from(img.inlineData.data, 'base64');
const binary = await this.helpers.prepareBinaryData(buf, 'post-image.png', img.inlineData.mimeType || 'image/png');
return [{ json: { imageReady: true, bytes: buf.length, category: $('Build Assets').first().json.category }, binary: { data: binary } }];

import { IncomingForm } from 'formidable';
import fs from 'fs';
import FormDataNode from 'form-data';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const form = new IncomingForm();
    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'File parse error', details: err.message });
      }

      const fileArray = files.file || files.files;
      if (!fileArray || fileArray.length === 0) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const file = fileArray[0];

      // 1. Check Env Vars
      if (!process.env.ZOHO_DC || !process.env.ZOHO_CLIENT_ID) {
        return res.status(500).json({ error: 'Missing Environment Variables. Please make sure they are saved for the "Preview" environment in Vercel as well as Production.' });
      }

      // 2. Token Fetch
      let tokenText = '';
      let accessToken = '';
      try {
        const tokenUrl = `https://accounts.zoho.${process.env.ZOHO_DC}/oauth/v2/token?grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&refresh_token=${process.env.ZOHO_REFRESH_TOKEN}`;
        const tokenRes = await fetch(tokenUrl, { method: 'POST' });
        tokenText = await tokenRes.text();
        const tokenData = JSON.parse(tokenText);
        accessToken = tokenData.access_token;
        if (!accessToken) throw new Error('No access token in response');
      } catch (e) {
        return res.status(500).json({ error: 'Failed at Token Fetch', message: e.message, response: tokenText });
      }

      // 3. Upload Fetch
      let uploadText = '';
      try {
        const fileData = fs.readFileSync(file.filepath);
        const form = new FormDataNode();
        form.append('content', fileData, {
          filename: file.originalFilename || 'upload.ext',
          contentType: file.mimetype || 'application/octet-stream'
        });
        form.append('parent_id', process.env.ZOHO_FOLDER_ID);
        form.append('override-name-exist', 'true');

        const uploadUrl = `https://www.zohoapis.${process.env.ZOHO_DC}/workdrive/api/v1/upload`;
        
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${accessToken}`,
            ...form.getHeaders()
          },
          body: form.getBuffer()
        });
        
        uploadText = await uploadRes.text();
        
        if (!uploadRes.ok) {
           return res.status(uploadRes.status).json({ 
             error: 'Zoho HTTP Error', 
             status: uploadRes.status, 
             response: uploadText,
             debugUrl: uploadUrl,
             debugDC: process.env.ZOHO_DC,
             debugFolder: process.env.ZOHO_FOLDER_ID
           });
        }

        let uploadData;
        try {
          uploadData = JSON.parse(uploadText);
        } catch (e) {
          return res.status(500).json({ error: 'Zoho returned invalid JSON', response: uploadText });
        }
        
        if (uploadData.data && uploadData.data.length > 0) {
          return res.status(200).json({ url: uploadData.data[0].attributes.Permalink, name: file.originalFilename });
        } else {
          return res.status(500).json({ error: 'Zoho upload failed to return data', details: uploadData });
        }
      } catch (e) {
        return res.status(500).json({ error: 'Failed at Upload Fetch', message: e.message, response: uploadText });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Outer Exception', message: error.message });
  }
}

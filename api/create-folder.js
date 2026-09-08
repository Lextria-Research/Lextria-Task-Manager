export default async function handler(req, res) {
  try {
    const tokenUrl = \https://accounts.zoho.\/oauth/v2/token?grant_type=refresh_token&client_id=\&client_secret=\&refresh_token=\\;
    const tokenRes = await fetch(tokenUrl, { method: 'POST' });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const workspaceId = 'bklhub7a6b938491548f0a0c6f279c4ac6aac';

    const createUrl = \https://www.zohoapis.\/workdrive/api/v1/files\;
    
    const payload = {
      data: {
        attributes: {
          name: "Lextria_Uploads",
          parent_id: workspaceId
        },
        type: "files"
      }
    };

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 
        'Authorization': \Zoho-oauthtoken \\,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json'
      },
      body: JSON.stringify(payload)
    });
    
    const createText = await createRes.text();
    return res.status(200).send(createText);
  } catch (error) {
    return res.status(500).send(error.message);
  }
}

import axios from "axios";

export const appendToSheet = async (spreadsheetId: string, range: string, values: any[][], token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=RAW`;
  const response = await axios.post(url, {
    values,
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getSheetData = async (spreadsheetId: string, range: string, token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const createSheet = async (title: string, token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets`;
  const response = await axios.post(url, {
    properties: { title },
    sheets: [
      {
        properties: { title: "Sheet1" }
      }
    ]
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const getSpreadsheetMetadata = async (spreadsheetId: string, token: string) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const sendEmail = async (to: string, subject: string, body: string, token: string) => {
  const url = `https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send`;
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join("\r\n");

  const base64Email = btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await axios.post(url, {
    raw: base64Email,
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

const apiKey = process.env.BREVO_APIKEY || ""
const base_url = "https://api.brevo.com/v3"
const sender_email = process.env.BREVO_SENDEREMAIL || ""
const sender_name = process.env.BREVO_SENDERNAME || "PanaMia Club"
const test_receiver = 'jeremy.l.downs@gmail.com'

// JDowns: The official SDK triggered lots of errors so I
// uninstalled and am fetching the API directly

const api_schema = {
  TransactionalEmailsApi:	{sendTransacEmail:	{method: "POST", endpoint: "/smtp/email"}}
}

export default async function sendEmail(subject: string, body: string) {
    const call = api_schema.TransactionalEmailsApi.sendTransacEmail;
    const full_endpoint = `${base_url}${call.endpoint}`

    const sender = {
      email: sender_email,
      name: sender_name,
    }
    const receivers = [
        {
            email: test_receiver,
        },
    ]

    const resp = await fetch(full_endpoint, {
        method: call.method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify({
            "sender":sender,
             "to":receivers,
             "subject":subject,
             "htmlContent":body
        })
    }).then((response) => {
      // console.log("brevo_fetch", "response", response);
      return response
    }).catch((error) => {
      console.log("brevo_fetch", "error", error);
      return error
    });
    return resp;
}

// References:
// https://github.com/getbrevo/brevo-node
// https://ppolivka.com/posts/creating-email-form-nextjs
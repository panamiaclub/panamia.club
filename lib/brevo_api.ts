// JDowns: The official SDK triggered lots of errors so I
// uninstalled and am fetching the API directly

export default class BrevoApi {
  config = {
    apiKey: process.env.BREVO_APIKEY || "",
    base_url: "https://api.brevo.com/v3",
    sender_email: process.env.BREVO_SENDEREMAIL || "",
    sender_name: process.env.BREVO_SENDERNAME || "PanaMia Club",
    default_receiver: process.env.DEV_RECEIVER_EMAIL || 'hola@panamia.club',
    lists: {
      "addedByWebsite": process.env.BREVO_LIST_ADDEDBYWEBSITE,
      "webformNewsletter": process.env.BREVO_LIST_WEBFORMNEWSLETTER,
      "webformContactUs": process.env.BREVO_LIST_WEBFORMCONTACTUS,
      "webformLogin": process.env.BREVO_LIST_WEBFORMLOGIN,
      "webformProfile": process.env.BREVO_LIST_WEBFORMPROFILE,
      "webformAccount": process.env.BREVO_LIST_WEBFORMACCOUNT,
    },
    templates: {
      "adminSignupConfirmation": process.env.BREVO_TEMPLATE_ADMINSIGNUPCONFIRMATION
    },
    api_schema: {
      Emails:	{sendTransactional:	{method: "POST", endpoint: "/smtp/email"}},
      Contacts:	{
        getByEmail:	{method: "GET", endpoint: "/contacts/{email}"},
        create:	{method: "POST", endpoint: "/contacts"},
      },
      ContactLists: {
        add:	{method: "GET", endpoint: "/contacts/lists/{listId}/contacts/add"},
      }
    }
  }
  
  ready = false;
  constructor() {
    this.ready = this.validApiKey();
  }

  validApiKey() {
    if (!this.config.apiKey) {
      console.log("Brevo:validApiKey:noApiKey");
      return false;
    }
    return true;
  }

  async getCall(endpoint: string) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': this.config.apiKey
      },
    });
    if (response.ok) {
      const result = await response.json();
      console.log(`brevo:[${endpoint}]:result`, result);
      return result;
    } else {
      console.log(`brevo:[${endpoint}]:responseNotOk`, response.status, response.statusText);
      return null;
    }
  }

  async postCall(endpoint: string, body: any) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': this.config.apiKey
      },
      body: JSON.stringify(body),
    });
    console.log(`brevo:[${endpoint}]:body`, body);
    if (response.ok) {
      const result = await response.json();
      console.log(`brevo:[${endpoint}]:result`, result);
      return result;
    } else {
      console.log(`brevo:[${endpoint}]:responseNotOk`, response.status, response.statusText);
      return null;
    }
  }

  async sendTemplateEmail(template_id: number, params: {}, email?: string) {
    const call = this.config.api_schema.Emails.sendTransactional;
    const full_endpoint = `${this.config.base_url}${call.endpoint}`

    const receiver_email = (email ? email : this.config.default_receiver)
    let receivers = [
        {
            email: receiver_email
        },
    ];

    return this.postCall(full_endpoint, {
       "to":receivers,
       "templateId": template_id,
       "params": params,
    });
  }

  async findContact(email: string) {
    const call = this.config.api_schema.Contacts.getByEmail;
    const full_endpoint = `${this.config.base_url}${call.endpoint}`
    const params_endpoint = full_endpoint.replace('{email}', encodeURIComponent(email));
  
    return this.getCall(params_endpoint);
  }

  async createOrUpdateContact(email: string, attributes: {}, list_ids?: any[]) {
    const call = this.config.api_schema.Contacts.create;
    const full_endpoint = `${this.config.base_url}${call.endpoint}`
  
    return this.postCall(full_endpoint, {
      "email": email,
      "attributes": attributes,
      "updateEnabled": true,
      ...((list_ids && list_ids.length > 0) && {"listIds": list_ids}),
    });
  }

  addContactToList(list_id: string, email: string) {
    const call = this.config.api_schema.ContactLists.add;
    const full_endpoint = `${this.config.base_url}${call.endpoint}`;
    const params_endpoint = full_endpoint.replace('{listId}', encodeURIComponent(list_id));
  
    return this.postCall(params_endpoint, {
      "emails": [email]
    });
  }
}

// References:
// https://api.brevo.com/v3/swagger_definition.yml
// https://developers.brevo.com/reference/getting-started-1
// https://github.com/getbrevo/brevo-node
// https://ppolivka.com/posts/creating-email-form-nextjs
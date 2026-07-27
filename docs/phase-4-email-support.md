# Email and support boundary

Production delivery is disabled. Local and preview use local SMTP capture, provider sandbox, or deterministic template rendering only. Signup confirmation and recovery remain identity-provider-managed. Application templates cover billing support, payment failure, cancellation, deletion acknowledgement/completion, and account restriction.

Each template produces plain text plus semantic HTML, escapes teacher display names, accepts only an exact validated HTTP(S) application origin, and contains no technical IDs or secrets. User-controlled subject/template markup and arbitrary callback URLs are forbidden. Transactional security, account, deletion, and billing notices are not marketing and therefore have no marketing unsubscribe; any future promotional mail requires a separate consent/unsubscribe design.

Support email, security contact, hours, and response targets remain owner decisions. Until chosen, the UI must not invent an address or promise a response time. Pilot issues should use the owner-controlled form described in the pilot plan, with no student data, passwords, tokens, or payment details.


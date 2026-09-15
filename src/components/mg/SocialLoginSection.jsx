import React from "react";
import GoogleIcon from "@/components/GoogleIcon";

export const FacebookIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      fill="#1877F2"
    />
  </svg>
);

export const MicrosoftIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3h8v8H3z" fill="#F25022" />
    <path d="M13 3h8v8h-8z" fill="#7FBA00" />
    <path d="M3 13h8v8H3z" fill="#00A4EF" />
    <path d="M13 13h8v8h-8z" fill="#FFB900" />
  </svg>
);

export const AppleIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.56 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.71-1.04-2.74-4.13zM14.6 4.59c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-3 1.54-.66.76-1.24 1.98-1.08 3.15 1.14.09 2.31-.58 3.02-1.44z" />
  </svg>
);

export const SOCIAL_LOGIN_PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "facebook", label: "Facebook", Icon: FacebookIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "apple", label: "Apple", Icon: AppleIcon },
];

/*
 * Login.jsx and Register.jsx import the shared provider definitions above.
 * Settings used to render a second copy of the same social-login controls,
 * which duplicated the sign-in experience after a user was already logged in.
 * Keep the default export for backwards compatibility with SettingsView, but
 * deliberately render nothing there so social sign-in exists only on the
 * normal login/register screens.
 */
export default function SocialLoginSection() {
  return null;
}


<script lang="ts">
  import { goto } from "@sapper/app";
  import { stores } from "@sapper/app";
  import { apps } from "@store/applications.js";
  import { notifications } from "@store/notifications.js";
  import { experiments } from "@store/experiments.js";
  import SignedOutFooter from "@components/SignedOutFooter.svelte";
  import SignedOutHeader from "@components/SignedOutHeader.svelte";
  import { getContext } from "svelte";
  import Auth from "../methods/auth.js";
  import LoaderIcon from "@design-system/atoms/loading/icon-loader-static.svg";
  import { getApplications } from "@methods/getApplications.js";
  import { organization } from "@store/organization.js";
  import {
    GOOGLE_SSO_ERROR_MESSAGE_MAP,
    loadGoogleApis,
    onGapiLoad,
  } from "@routes/endpoints/users/_loadGoogleApis";
  import { readAndClearSsoCookieData } from "@routes/endpoints/users/_processSsoCookieData";
  import {
    GITHUB_SSO_TYPE,
    GOOGLE_SSO_TYPE,
    SsoTypeMarketoEventNameMap,
  } from "@constants/sso";
  import {
    GTM_REGISTER_SUCCESS_EVENT,
    pushGoogleTagManagerCustomEvent,
  } from "../google-analytics";
  import GoogleLogoSvg from "@icons/icon-google.svg";
  const { session } = stores();
  const { track, getWoopraUserProfile, setVisitorProperty } = getContext(
          "UserEventsContext"
  );

  let submitting = false;
  let email = "";
  let password = "";
  // To store Profile Retrieve data from Woopra
  let userProfile = null;

  $: loggedIn =
          typeof $session.user !== "undefined" &&
          typeof $session.user.email_address !== "undefined";

  async function handleSubmit() {
    submitting = true;
    let body = {
      email_address: email,
      password,
    };
    await fetch("/endpoints/users/session", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
            .then(handleResponse)
            .then(setSessionAndRedirect)
            .catch(handleError);
  }

  async function setSessionAndRedirect(responseObj, isSignUp) {
    userProfile = await Promise.race([
      getWoopraUserProfile(responseObj),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const onboardingProp = userProfile?.properties.find(
            (prop) => prop.key === "exciting_onboarding"
    );

    const onboarding = onboardingProp
            ? onboardingProp.raw === ""
                    ? null
                    : JSON.parse(onboardingProp.raw)
            : {};
    session.update((session) => {
      return {
        ...session,
        cookie: document.cookie,
        session_token: responseObj.user.session_token,
        user: Object.assign(session.user, responseObj.user),
        onboarding: Object.assign(session.onboarding || {}, onboarding),
        availableExperiments: responseObj.availableExperiments,
      };
    });

    localStorage.setItem("nylas_dashboard_storage", JSON.stringify($session));

    Auth.establishSession(session, $session);

    getApplications($session.session_token)
            .then(async (applications) => {
              apps.establishApps(applications);
              const quickstartApp = applications.find((app) => app.is_trial);

              if (isSignUp) {
                if (quickstartApp) {
                  setVisitorProperty("exciting_onboarding", {
                    currentStage: "/",
                  });
                  apps.registerQuickstartApp(quickstartApp, $session);
                  track("User Onboarding Started");
                  goto(`onboarding`, { replaceState: true });
                }
              } else {
                let currentStage = $session.onboarding.currentStage;
                let redirectToExcitingOnboarding =
                        $session.onboarding &&
                        !$session.onboarding.isComplete &&
                        !$session.onboarding.wantsToExploreOnTheirOwn &&
                        $session.onboarding.currentStage;

                // If a user has just registered an account
                // they would not have had their woopra profile
                // created for them (due to email verification
                // required at sign-up). So we make an assumption
                // that if the user has only one app, and that app
                // is a quickstart app - we'll initiate the
                // exciting onboarding for them.
                if (
                        applications.length === 1 &&
                        quickstartApp?.is_trial === true &&
                        !$session.onboarding.currentStage
                ) {
                  currentStage = "/";
                  setVisitorProperty("exciting_onboarding", {
                    currentStage,
                  });
                  redirectToExcitingOnboarding = true;
                }

                const orgDetails = await organization.getOrganization(
                        $session.session_token
                );

                if (
                        $experiments.XP_TRIAL_EXPIRED_REDESIGN &&
                        orgDetails.trial_is_expired
                ) {
                  // TODO: fetch the stage the user is at from woopra and redirect them accordingly.
                  goto("/billing?upgrade=true&stage=1");
                } else if (redirectToExcitingOnboarding) {
                  track("User Onboarding Progressed");
                  goto(`onboarding${currentStage}`, {
                    replaceState: true,
                  });
                } else {
                  if ($session.desiredRoute && $session.desiredRoute !== "/") {
                    goto($session.desiredRoute, { replaceState: true });
                  } else if (applications.length === 1) {
                    goto(`applications/${applications[0].client_id}`, {
                      replaceState: true,
                    });
                  } else {
                    goto("applications", { replaceState: true });
                  }
                }
              }

              // Forget about our previously desiredRoute; we've goto'd it already.
              if ($session.desiredRoute) {
                session.update((session) => {
                  let desirelessSession = { ...session };
                  delete desirelessSession.desiredRoute;
                  return desirelessSession;
                });
              }
            })
            .catch((err) => {
              submitting = false;
              notifications.addNotification({
                title: `Sign ${isSignUp ? "up" : "in"} failed`,
                type: "error",
                text: err.message,
                id: new Date().getTime(),
              });
            });
  }

  async function handleResponse(response) {
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.message || response.statusText);
    }
    return json;
  }

  async function handleError(err, ssoType) {
    submitting = false;
    notifications.addNotification({
      title: "Sign in failed",
      type: "error",
      text: err.message,
      id: new Date().getTime(),
    });

    console.error(err);

    if (ssoType) {
      track("Error On User Sign In", {
        error: err.toString(),
        ssoType,
      });
    }
  }

  function onGithubSsoSignIn() {
    submitting = true;
    try {
      sessionStorage.setItem(
              "nylas_woopra_data",
              JSON.stringify(window.woopra)
      );
    } catch (e) {
      console.error("failed to write sessionstorage data", e);
    }
    goto(
            `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_OAUTH_CLIENT_ID}&scope=user:email&redirect_uri=${location.origin}/endpoints/users/github-sso-signup?sign_in=1`,
            { replaceState: true }
    );
  }

  async function trackAndRedirect(signOnResponse, ssoType) {
    submitting = true;
    const data = [
      ["ssoType", ssoType],
      ["firstName", signOnResponse.user.firstname],
      ["lastName", signOnResponse.user.lastname],
      ["email", signOnResponse.user.email_address],
      ["location", (signOnResponse.p || {}).l],
      ["company", (signOnResponse.p || {}).c],
    ]
            .filter(([_, value]) => !!value)
            .map(([key, value]) => ({ [key]: value }));

    const marketoEvents = [
      ...data,
      { [SsoTypeMarketoEventNameMap[ssoType]]: true },
    ];

    const payload = data.reduce((mem, entry) => Object.assign(mem, entry), {
      marketoEvents,
    });
    const isSignUp = !!signOnResponse.i;
    const promises = [];
    if (isSignUp) {
      promises.push(
              pushGoogleTagManagerCustomEvent(GTM_REGISTER_SUCCESS_EVENT, {
                nylasUserId: signOnResponse.user.id,
              }).catch((err) => console.error(err)),
              track("User Signed Up Using SSO", payload, {}, true),
              track("Organization Created", {
                ssoRegistration: ssoType,
              })
      );
    } else {
      promises.push(track("User Signed In Using SSO", payload, {}, true));
    }
    await Promise.all(promises);
    return setSessionAndRedirect(signOnResponse, isSignUp);
  }

  let googleSsoState = "LOADING";
  $: (async () => {
    if (process.browser) {
      const woopraData = sessionStorage.getItem("nylas_woopra_data");
      if (woopraData) {
        try {
          const parsedData = JSON.parse(woopraData);
          delete parsedData.__l;
          Object.assign(window.woopra, parsedData);
        } catch (e) {
          console.error("failed to parse sessionstorage data", e);
        } finally {
          sessionStorage.removeItem("nylas_woopra_data");
        }
      }

      const { statusCode, response } = readAndClearSsoCookieData() || {};
      if (response) {
        if (statusCode < 400) {
          await trackAndRedirect(response, GITHUB_SSO_TYPE);
        } else {
          handleError(response, GITHUB_SSO_TYPE);
        }
      }
      loadGoogleApis()
              .then(() =>
                      onGapiLoad({
                        elementId: GOOGLE_SSO_TYPE,
                        onsuccess: onGoogleSsoSignIn,
                        onfailure: ({ error }) => {
                          const errorInstance = new Error(
                                  GOOGLE_SSO_ERROR_MESSAGE_MAP[error]
                          );
                          return handleError(errorInstance, GOOGLE_SSO_TYPE);
                        },
                        buttonText: "Sign in with Google",
                      })
              )
              .then(
                      () => {
                        // button is loaded
                        googleSsoState = "LOADED";
                      },
                      () => {
                        googleSsoState = "ERROR";
                      }
              );
    }
  })();

  async function onGoogleSsoSignIn(googleUser) {
    const id_token = googleUser.getAuthResponse().id_token;
    submitting = true;
    await fetch("/endpoints/users/google-sso-signup?sign_in=1", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id_token,
        is_trial: true,
      }),
    })
            .then(handleResponse)
            .then((response) => trackAndRedirect(response, GOOGLE_SSO_TYPE))
            .catch((error) => handleError(error, GOOGLE_SSO_TYPE));
  }
  let navigator = process.browser ? window.navigator : {};
</script>
2
<svelte:head>
  <title>Sign In - Nylas Dashboard</title>
</svelte:head>
3
<h1 data-error-out></h1>
{#if 0}
  <div>0</div>
{/if}
{#each [] as a, i}
  <div>each</div>
  {/each}
4
<style lang="scss">
  @import "styles/variables";
  @import "styles/forms";
  @import "styles/sign-on";

  .sign-in {
    @include signed-out-style(false);
  }

  .banner-image {
    display: none;
  }

  @media #{$desktop} {
    .banner-image {
      display: block;
      position: fixed;
      top: 0;
      right: 0;
      max-width: calc(100% - 640px);
      max-height: 891px;
    }
  }
  $form-spacing: 1.5em;

  form {
    button.sign-in-button {
      @include teal-element($signedout: true);
      @include signed-out-button;

      margin-bottom: $form-spacing;
      align-items: center;
      display: flex;
      justify-content: center;
      letter-spacing: initial;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.2);

      :global(svg) {
        display: none;
      }

      &.submitting {
        background-color: darken($color-green, 12);
        box-shadow: 0 -1px 0 0 rgba(0, 0, 0, 0.2) inset,
        0 1px 0 0 rgba(0, 0, 0, 0.08);

        :global(svg) {
          display: initial;
          margin-right: 12px;
          animation: rotating 1s linear infinite;
        }
      }
    }
  }

  .sso-or {
    display: flex;
    align-items: center;
    margin-bottom: $form-spacing;

    hr {
      flex-grow: 1;
    }

    span {
      padding: 0 16px;
    }
  }

  .button-group {
    margin-bottom: $form-spacing;

    .github-sign-in-button {
      border: 1px solid white;
      background: black;
      display: flex;
      width: 100%;
      align-items: center;
      text-align: left;

      &.submitting {
        background: $color-grey-dark;
      }

      .github-icon {
        background: $color-white;
        padding: 10px;
        height: 48px;
        width: 48px;
      }

      span {
        padding-left: 24px;
        color: $color-white;
        flex-grow: 1;
      }
    }

    :global(.google-sign-in-button) {
      width: 100%;
      margin-bottom: 10px;

      &.showFakeButton {
        display: none;
      }

      &.submitting :global(.abcRioButton) {
        background: $color-grey-dark;
      }

      :global(.abcRioButton) {
        box-shadow: none;
        background: black;
        color: white;
        display: block;

        :global(.abcRioButtonContentWrapper) {
          display: flex;
          border: 1px solid $color-white;

          :global(.abcRioButtonIcon) {
            padding: 15px;
            display: flex;
            background: white;
          }

          :global(.abcRioButtonContents) {
            margin-left: 24px;
            font-family: inherit;
            letter-spacing: inherit;
            font-size: inherit;
            line-height: 48px;
          }
        }
      }
    }
  }
</style>
5

{#await 0}
  <div>pending</div>
  {:then a}
  <div>then</div>
  {:catch e}
  <div>catch</div>
  {/await}
<svelte:component this={0}>
  <div>component</div>
</svelte:component>
{#if 0}
<svelte:self>
  <div>self</div>
</svelte:self>

  {/if}
{a}

6
<script context="module">

</script>
7
<svelte:options>
  <div>options</div>
</svelte:options>

8

{#if !loggedIn}
  <section class="sign-in">
    <SignedOutHeader />
    <h2>Log In</h2>
    <form on:submit|preventDefault={handleSubmit} role="form">
      <div class="input-field-container">
        <label>
          <strong class="sr-only">Email Address</strong>
          <input
                  autofocus
                  aria-label="emailAddress"
                  name="emailAddress"
                  type="email"
                  title="Email Address"
                  placeholder="Email Address"
                  bind:value={email} />
        </label>
        <label>
          <strong class="sr-only">Password</strong>
          <input
                  aria-label="password"
                  name="password"
                  title="10+ characters"
                  type="password"
                  placeholder="Password"
                  bind:value={password} />
        </label>
      </div>
      <button type="submit" class="sign-in-button" class:submitting>
        {#if submitting}
          <LoaderIcon aria-hidden="true" alt="Loading" />
          Signing you in
        {:else}Sign in{/if}
      </button>
    </form>
    <div class="sso-or">
      <hr />
      <span> Or </span>
      <hr />
    </div>
    <div class="button-group">
      <!--suppress CheckEmptyScriptTag -->
      <button
              aria-label="Sign Up with Google"
              on:click={() => {
          submitting = true;
          track('User Clicked On Sign In With Google');
        }}
              id={GOOGLE_SSO_TYPE}
              class:submitting
              class:showFakeButton={googleSsoState === 'LOADING'}
              class="google-sign-in-button" />
      {#if googleSsoState === 'LOADING' || googleSsoState === 'ERROR'}
        <button
                on:click={() => {
            handleError(new Error('Sign up with Google does not work with disabled browser cookies. Please check your browser settings.'), GOOGLE_SSO_TYPE);
          }}
                disabled={navigator.cookieEnabled && googleSsoState === 'LOADING'}
                class="google-sign-in-button submitting">
          <span class="abcRioButton abcRioButtonBlue">
            <span class="abcRioButtonContentWrapper">
              <span class="abcRioButtonIcon">
                <GoogleLogoSvg />
              </span>
              <span class="abcRioButtonContents">{(() => {
                if (googleSsoState === 'LOADING') {
                  return 'Loading sign in with Google...';
                }
                if (googleSsoState === 'ERROR') {
                  return 'Please enable browser cookies';
                }
                return 'Sign in with Google';
              })()}</span>
            </span>
          </span>
        </button>
      {/if}
      <button
              class:submitting
              aria-label="Sign In with Github"
              on:click={async () => {
          submitting = true;
          await track('User Clicked On Sign In With GitHub');
          onGithubSsoSignIn();
        }}
              class="github-sign-in-button"><img
              loading="lazy"
              class="github-icon"
              alt="Github"
              src="/logo_github_copy@2x.png" /><span>Sign in with Github</span></button>
    </div>
    <div class="options">
      <p class="auth-link">
        Forgot your password?
        <a
                href={$experiments.XP_NEW_LOGIN_UI ? '/forgot-password' : '/send-reset-password'}>Reset
          Password</a>
      </p>
      <p class="auth-link">
        Don't have an account?
        <a href="/register">Register</a>
      </p>
    </div>
    <div class="footer-container">
      <SignedOutFooter />
    </div>
  </section>
  <img
          loading="lazy"
          class="banner-image"
          src="/nylas-register-graphic.png"
          alt="Welcome to Nylas" />
{/if}

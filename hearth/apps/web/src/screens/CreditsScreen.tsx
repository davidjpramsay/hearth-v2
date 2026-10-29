import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingsBackLink } from '../components/SettingsNavigation';
import './CreditsScreen.css';

export function CreditsScreen() {
  return (
    <div className="screen credits-screen">
      <ScreenHeader
        title="Credits"
        actions={
          <SettingsBackLink
            fallbackTo="/more"
            fallbackLabel="Back to More"
            className="credits-back focusable"
            data-focus-id="credits-back"
            data-focus-entry="true"
          >
            <Icon name="chevron-left" />
            <span>Back to More</span>
          </SettingsBackLink>
        }
      />
      <section aria-labelledby="bible-credits-title" className="credits-notice">
        <h2 id="bible-credits-title">Bible quotations</h2>
        <p>
          Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®),
          © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All
          rights reserved. The ESV text may not be quoted in any publication made available to the
          public by a Creative Commons license. The ESV may not be translated into any other
          language.
        </p>
        <p>
          Users may not copy or download more than 500 verses of the ESV Bible or more than one half
          of any book of the ESV Bible.
        </p>
        <a className="focusable" href="https://www.esv.org/" target="_blank" rel="noreferrer">
          ESV.org
        </a>
      </section>
    </div>
  );
}

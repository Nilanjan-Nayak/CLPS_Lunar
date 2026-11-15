import { Link } from 'react-router-dom';
import { CHALLENGE_BRIEF, CHALLENGE_RESOURCES, type ChallengeResource } from '@/features/planning/challengeResources';

function ResourceCard({ resource, number }: { resource: ChallengeResource; number: string }) {
  return (
    <article className="challenge-resource-card" data-resource={resource.id}>
      <div className="challenge-resource-top"><span className="challenge-resource-number">{number}</span><span className="challenge-resource-badge">{resource.badge}</span></div>
      <div className="challenge-resource-group">{resource.group}</div>
      <h2>{resource.name}</h2>
      <p>{resource.short}</p>
      <div className="challenge-resource-use"><span>HOW IT IS USED HERE</span><p>{resource.application}</p></div>
      <div className="challenge-resource-actions">
        <a href={resource.url} target="_blank" rel="noreferrer">Open {resource.name} ↗</a>
        {resource.id !== 'csa' && <Link to="/plan">Use in landing plan →</Link>}
      </div>
    </article>
  );
}

export function SourcesPage() {
  const nasa = CHALLENGE_RESOURCES.filter((resource) => resource.group === 'NASA challenge resource');
  const supporting = CHALLENGE_RESOURCES.filter((resource) => resource.group !== 'NASA challenge resource');
  return (
    <div className="challenge-resource-page">
      <div className="challenge-resource-hero">
        <div>
          <div className="challenge-eyebrow"><span className="challenge-pulse" /> NASA SPACE APPS 2026</div>
          <h1>Challenge resources</h1>
          <p>The essential tools behind the Lunar Landing Site Navigator, connected directly to your site analysis.</p>
          <div className="challenge-resource-hero-actions"><Link className="btn primary" to="/plan">Start a landing plan →</Link><a className="btn" href={CHALLENGE_BRIEF} target="_blank" rel="noreferrer">Official challenge ↗</a></div>
        </div>
        <div className="challenge-resource-hero-aside"><span className="challenge-resource-orbit">◎</span><span>MAP <b>→</b> TERRAIN <b>→</b> SKY</span><small>One coordinated lunar workflow</small></div>
      </div>
      <div className="challenge-resource-section-title"><div><span>THE CORE TOOLKIT</span><h2>NASA challenge resources</h2></div><p>Each resource has a specific role—not just a link.</p></div>
      <div className="challenge-resource-grid challenge-resource-grid-three">{nasa.map((resource, i) => <ResourceCard key={resource.id} resource={resource} number={`0${i + 1}`} />)}</div>
      <div className="challenge-resource-section-title"><div><span>DATA &amp; PARTNER CONTEXT</span><h2>Supporting the challenge</h2></div><p>LOLA is named in the brief; CSA is a listed partner resource.</p></div>
      <div className="challenge-resource-grid challenge-resource-grid-two">{supporting.map((resource, i) => <ResourceCard key={resource.id} resource={resource} number={`0${i + 4}`} />)}</div>
      <p className="challenge-provenance-note">Only challenge resources are shown here. Mission-specific citations and asset provenance remain available in their relevant mission or scene, so scientific attribution is preserved. SELENARA X is an independent project, not an official NASA product.</p>
    </div>
  );
}

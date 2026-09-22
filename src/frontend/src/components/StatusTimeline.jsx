import { fmtTime } from './ui.jsx';

export default function StatusTimeline({ timeline = [], vertical = false, showTime = true }) {
  const currentIndex = timeline.findIndex((s) => !s.done);
  const current = currentIndex === -1 ? timeline.length - 1 : currentIndex;

  return (
    <div className={`timeline${vertical ? ' vertical' : ''}`}>
      {timeline.map((step, i) => {
        const isCurrent = i === current && step.done === false;
        return (
          <div
            key={step.key}
            className={`timeline-step${step.done ? ' done' : ''}${isCurrent ? ' current' : ''}`}
          >
            <span className="dot" />
            <div className="step-label">{step.label}</div>
            {showTime ? <div className="step-time">{step.at ? fmtTime(step.at) : step.done ? '' : 'Pending'}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

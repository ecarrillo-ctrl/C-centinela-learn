import { Link } from 'react-router-dom';

export default function EmptyState({ title = 'Aun no hay datos', icon = '\u{1F4CA}', description = '', action, actionTo }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h2 className="font-title text-xl font-bold mb-2" style={{ color: '#001B71' }}>{title}</h2>
      {description && <p className="text-gray-400 max-w-md mb-4">{description}</p>}
      {action && (
        <Link to={actionTo || '#'} className="px-5 py-2.5 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#001B71' }}>{action}</Link>
      )}
    </div>
  );
}

import type { Member } from '@hearth/shared';

export function Avatar({
  member,
  size = 'regular',
}: {
  member: Member;
  size?: 'small' | 'regular';
}) {
  if (member.avatarUrl.length === 0) {
    return (
      <span aria-hidden="true" className={`avatar avatar--${size} avatar--initials`}>
        {member.displayName.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      alt=""
      className={`avatar avatar--${size}`}
      height={size === 'small' ? 44 : 58}
      src={member.avatarUrl}
      width={size === 'small' ? 44 : 58}
    />
  );
}

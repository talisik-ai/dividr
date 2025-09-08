export const Header = ({
  numberOfProjects = 0,
}: {
  numberOfProjects?: number;
}) => {
  return (
    <div className="space-y-2">
      <h2 className="text-3xl font-semibold">Your Projects</h2>
      <p className="text-sm text-muted-foreground">
        {numberOfProjects} projects
      </p>
    </div>
  );
};

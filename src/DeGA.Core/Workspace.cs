namespace DeGA.Core
{
    public class Workspace
    {
        private readonly IWorkspaceFileSystem _fileSystem;

        public Workspace(string name)
        {
            _fileSystem = new WorkspaceFileSystem(name);
        }

        internal Workspace(IWorkspaceFileSystem fileSystem)
        {
            _fileSystem = fileSystem;
        }

        internal IWorkspaceFileSystem FileSystem => _fileSystem;

        public Workspace AddLayer()
        {
            var layer = new Layer(this);

            return this;
        }
    }
}

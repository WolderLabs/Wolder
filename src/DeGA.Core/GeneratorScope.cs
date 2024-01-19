namespace DeGA.Core
{
    public class GeneratorScope<TScopeContext>
    {
        private readonly List<ILayerAction> _actions = new();
        private readonly LayerActionFactory _layerActionFactory;
        private readonly IWorkspaceFileSystem _workspaceFileSystem;

        internal GeneratorScope(TScopeContext scope, LayerActionFactory layerActionFactory, IWorkspaceFileSystem workspaceFileSystem)
        {
            _layerActionFactory = layerActionFactory;
            _workspaceFileSystem = workspaceFileSystem;
        }

        internal IReadOnlyList<ILayerAction> Actions => _actions.AsReadOnly();

        public GeneratorScope<TScopeContext> AddAction<TAction, TOption>(TOption option)
            where TAction : ILayerAction<TOption>
            where TOption : notnull
        {
            var action = _layerActionFactory.Create<TAction, TOption>(option);
            _actions.Add(action);
            return this;
        }

        public async Task<string> WriteFileAsync(string relativePath, string text)
        {
            return await _workspaceFileSystem.WriteFileAsync(relativePath, text);
        }

        public string GetAbsolutePath(string relativePath)
        {
            return _workspaceFileSystem.GetAbsolutePath(relativePath);
        }
    }
}
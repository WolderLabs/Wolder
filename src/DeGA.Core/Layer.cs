namespace DeGA.Core
{
    public class Layer
    {
        private readonly List<ILayerAction> _actions = new();

        internal Layer()
        {
        }

        public Layer AddAction(ILayerAction action)
        {
            _actions.Add(action);
            return this;
        }
    }
}
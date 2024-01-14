namespace DeGA.Core
{
    public interface ILayerAction
    {
        Task InvokeAsync(Layer layer);
    }
}
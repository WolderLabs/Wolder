namespace DeGA.Core
{
    public interface IGeneratorAction<TOptions> : IGeneratorAction
    {
    }

    public interface IGeneratorAction
    {
        Task InvokeAsync();
    }
}
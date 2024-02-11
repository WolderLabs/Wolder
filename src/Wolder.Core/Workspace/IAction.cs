namespace Wolder.Core.Workspace;

public interface IAction<TOutput> : IRunnable<TOutput>
{
}

public interface IAction<in TParameter, TOutput> : IRunnable<TParameter, TOutput>
{
}

public interface IAction : IRunnable
{
}
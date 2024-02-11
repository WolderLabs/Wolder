namespace Wolder.Core.Workspace;

public interface IActionPlan : IRunnable
{
}

public interface IActionPlan<TOutput> : IRunnable<TOutput>
{
}

public interface IActionPlan<in TParameter, TOutput> : IRunnable<TOutput>
{
}

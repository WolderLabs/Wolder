﻿namespace DeGA.Core
{
    public interface ILayerAction<TOptions> : ILayerAction
    {
    }

    public interface ILayerAction
    {
        Task InvokeAsync(Layer layer);
    }
}